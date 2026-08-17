# Auth rebuild S1 — Identity · Credential · MFA ownership

**Date:** 2026-08-17
**Branch:** `claude/aura-os-auth-system-246a53`
**Status:** S1 security boundary **implemented and locally verified, including a fresh-database
migration run and fail-closed RLS on a real PostgreSQL engine.** Confirmation on the CI
Postgres service is still outstanding. Authentication is **not** yet production-ready — see
*Explicitly not done*.

**Migrations:** `0233_auth_credentials.sql`, `0234_identity_rls_policies.sql`

---

## 1. What was broken

Investigation of the whole auth path (`core/src/identity/*`, `apps/api/src/auth/*`,
`apps/web/app/api/auth/*`) found a live authentication bypass plus eight further defects.

| # | Defect | Severity |
|---|---|---|
| 1 | `POST /auth/login` accepted **any password** when `AUTH_DEV_PASSWORD` was unset, and `username` defaulted to `u-admin` → `POST {}` minted a wildcard platform-admin token | **Critical — full auth bypass** |
| 2 | No per-user credential existed anywhere. `aura_users` has no password column; all accounts shared one env var | **Critical** |
| 3 | `mfa/enroll` + `mfa/activate` were unauthenticated and took `account` from the body → anyone could enrol *and* activate MFA on another user's account (the attacker is handed the secret) and lock them out | **Critical** |
| 4 | `isActive()` returns `true` for unregistered ids → an invented username authenticated | High |
| 5 | Web login never collected/sent the TOTP `code`; the BFF dropped it → any user activating MFA was locked out of the UI | High |
| 6 | Web logout only deleted the cookie, never calling the API's working `revoke` → stolen tokens stayed valid to `exp` | High |
| 7 | Session cookie had no `secure` flag | High |
| 8 | `refresh` never re-checked deactivation and did not rotate | Medium |
| 9 | Login hardcoded `tenantId = 'dev-tenant'` | Medium |
| 10 | `/api/auth/switch-company` claims in its own docstring to validate the company against the user's authorized companies. **It validates nothing** — it writes an unsigned client-controlled JSON blob to a cookie (`aura-session`) that nothing reads (the real cookie is `aura_session`) | Dead + misleading |

Defect 10 was already recorded in the 2026-07-02 report and deferred *because* "fixing the
switcher requires a real company concept in auth" — which is the S3 work below.

---

## 2. Architecture

Authentication is now a composed flow with one concern per collaborator. The layering exists
so `CredentialsService` cannot drift into a God Service that knows about JWTs and org structure.

```
AuthController              HTTP mapping only — no flow logic, no token minting
     ↓
AuthenticationService       orchestration
     ├── UsersService            registered identity: exists? active?
     ├── CredentialsService      password hash · failed attempts · lockout · status
     ├── MfaService              second factor
     ├── AuthChallengeStore      the state between "password proved" and "session issued"
     └── SessionService          the ONLY thing that issues a session/token
```

**Login flow:**

```
identifier + password
      ↓
resolve REGISTERED identity  ── not found ──┐
      ↓                                      │
active?  ─────────────────── inactive ──────┤
      ↓                                      ├──→ audit precise reason
resolve + verify credential ── any failure ──┤    return ONE opaque result
      ↓                                      │
MFA enrolled? ──yes──→ mfa challenge (NO SESSION)
      ↓ no                    ↓ correct code
must-change? ──yes──→ password_change challenge (NO SESSION)
      ↓ no                    ↓ new password set
SessionService.create → access token → audit
```

### Challenge ordering is a decision, not an implementation artefact

MFA is challenged **before** a forced password change, and the two **chain** — a
must-change credential never pre-empts the second factor:

```
password verified → MFA (if enrolled) → password change (if forced) → session
```

The enforcing invariant:

> **required MFA satisfied AND required password change satisfied → a session may issue.**

This holds by construction, not by convention. A `password_change` challenge is issued in
exactly two places: by `authenticate()` on the branch already guarded by "no MFA enrolled",
and by `completeMfa()` *after* a code has verified. So a `password_change` challenge cannot
exist for an MFA-enrolled account that has not completed MFA. Challenges are also typed —
`AuthChallengeStore.get(id, kind)` rejects a mismatched kind — so presenting an `mfa`
challenge id to the password-change endpoint fails closed.

Both properties are asserted end-to-end (`chains MFA then password change…`, `cannot present
an MFA challenge to the password-change step…`), including that the failed bypass leaves the
password unchanged.

### Two invariants the code holds structurally

**1. No successful MFA → no authenticated session.** The password step returns a
`challengeId` and nothing else. `SessionService.create` is unreachable from that branch —
it is a challenge *exchange*, not a boolean flag a caller could forget to check.

**2. No denial reason crosses the boundary.** `AuthenticationResult` has no `reason` field:

```ts
| { kind: 'authenticated'; session: AuthSession }
| { kind: 'mfa_required'; challengeId: string }
| { kind: 'password_change_required'; challengeId: string }
| { kind: 'invalid_credentials' }          // ← every refusal, no detail
```

The precise reason (`unknown-user`, `inactive-user`, `bad-password`, `disabled`, `locked`)
is audited server-side and **cannot** be returned, because the controller never receives it.
`locked` is included deliberately: only a real account can be locked, so saying so confirms
the username.

### Key decisions

- **scrypt from `node:crypto`** — no new dependency; bcrypt/argon2 each pull a native build
  into every workspace importing `@aura/shared`. **Async** (`crypto.scrypt`, libuv
  threadpool), not `scryptSync`: a correctly-costed hash is ~50–100ms, and `scryptSync`
  blocks the event loop for every one of them. Cost parameters are stored in the hash, so
  cost can be raised without a migration.
- **`auth_credentials` is a separate table from `aura_users`.** Identity and authentication
  secret have different lifetimes and RLS needs, and `SELECT * FROM aura_users` (used across
  the admin surface) must never be able to carry a hash into a response.
- **Lockout is persisted, not per-process.** The previous in-memory throttle counted failures
  per node, so spreading attempts across replicas — or waiting out a restart — never tripped
  it. `EdgeRateLimitGuard` (IP/endpoint volume) remains a **separate, independent** control;
  the two address different threats and `/auth/login` is not rate-limit exempt.
- **`200`, not Nest's default `201`,** on all three sign-in steps. Authenticating is not
  resource creation; the contract is stated rather than inherited.
- **No placeholder authorization-context resolver.** Nothing stamps
  `companyId: 'default-company'`. A fabricated context is the same class of defect as the one
  being fixed. `companyId` stays `null` until S3 proves it from membership.

---

## 3. Verification

### The negative control (the important one)

The regression suite was run against a deliberately reintroduced bypass (username defaults to
`u-admin`, any password accepted, identity never resolved):

> **12 tests went red**, including every headline case: `{}` → token, invented username,
> wrong password, deactivated user, and MFA-without-code.

Reverted, the suite is 25/25 green. The tests are not false-green.

### Gates

| Gate | Result |
|---|---|
| `pnpm lint` (workspace) | **0 errors**, 734 warnings (at baseline) |
| `shared` unit suite | **462 passed** |
| `core` unit suite | **236 passed** |
| Auth security E2E (`auth-security.e2e-spec.ts`) | **25 passed** |
| Fresh-DB migration run (PGlite, real PG) | **233 / 234 applied** (only `0019`, needs pgvector) |
| Fail-closed RLS as `aura_app` (3 tables × same/other/no tenant + writes) | **11 / 11** |
| `CredentialsService` Postgres-path SQL | **11 / 11** |
| RBAC / tenant-isolation / SoD / spine E2E | **19 passed** |
| Combined relevant E2E | **44 passed** |
| Full workspace build **from deleted `dist/`** | **passes** |
| Changed-files review | 6 modified files, all auth; index changes export-only |

### Scenarios asserted

Empty body · unregistered username · invented username with the old shared dev password ·
wrong password · deactivated user with correct password · no credential on file · suspended
credential · **all five failure modes returning one byte-identical body** · no reason word
leaking into any response · lockout after repeated failures (still identical externally) ·
MFA challenge issues no token of any kind · wrong TOTP → no session · correct TOTP → session ·
challenge single-use · invented challenge id rejected · **MFA→password-change chained, session
only at the end** · **MFA challenge id rejected at the password-change step, password unchanged** ·
cross-account MFA enrolment impossible ·
anonymous enrolment refused · dev-token mint refused unless enabled · refresh refused for
revoked token · refresh refused for deactivated account · refresh rotates (surrendered token
dies) · client-supplied `companyId` never reaches the token · cross-tenant login refused.

### Migration gate — run, and it found a defect

No Docker and no outbound network to any registry, so the CI Postgres service was
unreachable. The gate was instead run against **PGlite** — real PostgreSQL (the actual PG
source) compiled to WASM, so the parser, planner and executor are genuine — using a harness
that mirrors `apps/api/scripts/migrate.mjs` exactly: filename order, `-- @DOWN` split, one
transaction per migration, duplicate-number guard. Installed outside the repo; the tree is
untouched.

| Check | Result |
|---|---|
| All migrations from a fresh database | **232 / 233 applied** |
| `0233_auth_credentials.sql` | applies cleanly; 11 columns as designed |
| Behavioural probes (PK, cross-tenant PK, check constraint, defaults, `gen_random_uuid()`, RLS flag) | **7 / 7** |
| `@DOWN` rollback | drops cleanly |
| `CredentialsService` **Postgres path** SQL | **11 / 11** |

The one failure is `0019_intelligence_pricing_autonomy.sql` — `extension "vector" is not
available`. PGlite does not bundle pgvector; unrelated to S1 and pre-existing.

The `CredentialsService` Postgres run mattered more than expected: **every automated test so
far had exercised the in-memory branch**, so those statements had never executed anywhere. A
wrong camelCase alias or a broken `ON CONFLICT` would have shipped invisibly and only failed
once a database was configured.

#### The defect: RLS enabled with no policy is default-DENY

`0233` originally did `enable row level security` and stopped there — matching what `0137`
(`aura_users`) and `0138` (`aura_service_accounts`) already do. Measured against a real
engine with a non-owner role:

```
RLS enabled, NO policy:   as owner → 1 row      as aura_app → 0 rows
```

Under the G-03 posture the API connects as `aura_app` (NOBYPASSRLS, and not the owner since
schema work moved to `MIGRATION_DATABASE_URL`), so an unpolicied table returns **zero rows to
the application while looking perfectly healthy to the owner in psql**.

That is fatal for S1 specifically: login now requires both a registered `aura_users` row *and*
an `auth_credentials` row, so "no rows" means **nobody can log in** — not "some data is
hidden". Before S1 it was masked, because login read no table at all and `isActive()` returned
`true` for unknown ids. One pre-existing bug was concealing another.

#### How login knows its tenant before authenticating

The first fix attempt allowed the row when no tenant was bound. **That was wrong**, and it is
worth recording why: it made the one table holding password hashes the one table readable
without a tenant, so any future code path that forgot to bind a tenant would silently get
cross-tenant credential access instead of an error. Fail-open in the most sensitive place.

It rested on a false premise — that login cannot know its tenant. It can:

```
POST /auth/login { username, password, tenantId? }   ← tenantId, or AUTH_DEFAULT_TENANT
        ↓
AuthenticationService.inTenant(tenantId, …)          ← TenantContext.run()
        ↓
TenantScopedPool copies it into app.current_tenant_id
        ↓
RLS policy scopes the credential lookup to that tenant
```

`PG_POOL` is already a `TenantScopedPool` that binds the ambient tenant on every query and is
already fail-closed. Nothing was binding it for login, because a login request is
unauthenticated. Binding the *requested* tenant closes that.

The requested tenant is **untrusted, and that is fine** — it is a scoping key, not a grant.
Naming a tenant only lets you *attempt* a login against it; the password still has to verify
against a credential inside it, and the policy guarantees the lookup can never reach outside
it. `actorId` stays null throughout: nothing has been proven yet.

So `0233` uses the same strict `tenant_id = current_tenant_id()` predicate as `0032`, with no
escape hatch.

#### `0234_identity_rls_policies.sql` — forward migration

`0134`/`0137`/`0138` are already applied on real databases and recorded in `aura_migrations`,
so editing them would change nothing where it matters. `0234` is additive and idempotent:

| Table | Fix |
|---|---|
| `aura_users` (0137) | tenant policy attached |
| `aura_service_accounts` (0138) | tenant policy attached |
| `aura_user_mfa` (0134) | **had no `tenant_id` column at all** — added, re-keyed to `(tenant_id, user_id)`, RLS enabled, policy attached |

`aura_user_mfa` was the notable one: TOTP secrets were keyed by `user_id` alone, so a secret
had no tenant identity to isolate on and RLS could not be enabled. The same user id in two
tenants is two different people — which is exactly what `aura_users`' composite primary key
already says. `MfaService` is now tenant-scoped on every operation, with unit tests for
per-tenant isolation of enrolment, reset and listing.

#### Fail-closed, verified as `aura_app`

Against a real engine, as a non-owner NOBYPASSRLS role — three cases per table:

| Table | same tenant | other tenant | **no tenant** |
|---|---|---|---|
| `aura_users` | allowed ✓ | denied ✓ | **denied ✓** |
| `auth_credentials` | allowed ✓ | denied ✓ | **denied ✓** |
| `aura_user_mfa` | allowed ✓ | denied ✓ | **denied ✓** |

Plus: inserts without tenant context are rejected on both write paths. **11/11.**

#### Still open (not identity, not S1)

`aura_numbering` (0028) and `aura_calendars` (0030) also enable RLS with no policy — silent
empty reads rather than an auth failure. Out of scope here; worth its own slice. For scale:
103 post-`0032` migrations attach a policy, 9 do not.

### The HSE/AMC/Fleet build errors were not a regression

The first API build showed 15 errors in `hse.controller.ts`, then 5 in amc/assets/fleet.
`modules/hse/src/hse.service.ts` contained all 11 referenced methods while
`modules/hse/dist/hse.service.d.ts` contained zero — stale build artifacts. A full rebuild
from deleted `dist/` passes with no source change to those modules, and `git status` confirms
none were touched.

---

## 4. Explicitly NOT done

Naming these precisely matters more than the list of what shipped.

| Area | State |
|---|---|
| **Migration against a fresh database** | **RUN — on PGlite (real PG in WASM), not on the CI Postgres service.** 232/233 migrations applied, `0233` clean, `CredentialsService` Postgres SQL 11/11, RLS fix 6/6. It found and closed a real defect (above). What it does **not** cover: the CI image's own extensions (pgvector), true multi-role privilege setup beyond the role probe, connection-level concurrency, and the seed→login→E2E chain against a wire-protocol server. A CI run on the branch is still worth doing as confirmation. |
| **`aura_users` / `aura_user_mfa` RLS** | **FIXED** in `0234` (forward migration) — fail-closed, verified 11/11 as `aura_app`. |
| `aura_numbering`, `aura_calendars` RLS | Same defect class, non-identity. Out of S1 scope; own slice. |
| **Web MFA login** | **NOT IMPLEMENTED.** The API returns `{challenge:'mfa', challengeId}`; the BFF has no branch for it and will show "login failed". Password-only web login is compatible and unaffected. Deferred to S4. |
| **Session lifecycle** | S2. No `auth_sessions` table, no refresh-token family, no replay detection. Refresh rotates the access token, which is a partial measure. |
| **Web cookie hardening / logout revocation** | S4. Cookie still lacks `secure`; web logout still does not call the API's `revoke`. |
| **`/api/auth/switch-company`** | Left as a dead compatibility surface, per plan. A test asserts no client-supplied company context reaches a token. Replaced in S3 by `POST /auth/context/company`. |
| **Company / project / warehouse authorization** | S3–S6. |
| **AI principal propagation** | S7. |

---

## 5. Next: S2 Session Lifecycle

Not Finance/Delivery/Store access — every authorization built later depends on a trustworthy,
revocable session principal.

### S2 design constraints (agreed, carry forward)

**The current `refresh` rotation is TRANSITIONAL, not a foundation.** It re-mints an access
token and revokes the old jti; it is not a refresh-token design and must not be built on.

The target separates the two credentials:

```
Access token    short-lived · references the authenticated principal/session
Refresh token   opaque · high entropy · HASHED server-side · belongs to a token family
                    ↓
                 Session ── Token Family
```

**The S2 invariant:**

> One refresh credential may be **successfully consumed exactly once** — including under
> concurrent requests.

```
R1 ──request A──→ R2   ✓ rotated
R1 ──request B──→ REPLAY DETECTED  ✗
                        ↓
                  containment: revoke the whole family
```

**Logout must run in this direction** (today's web logout does the opposite — it deletes the
cookie and nothing else):

```
web logout → API revoke → server session revoked → refresh family unusable → cookie deleted
```

### S2 schema — three tables, deliberately not one

`AuthChallengeStore` is in-memory and node-pinned today (documented in its header). It must
become persistent in S2, but **not** by being folded into the session table:

> A challenge is **pre-authentication** state. A session means every authentication
> requirement has been satisfied. An outstanding MFA challenge must never be representable
> as a partial or pending session — that is the concept S1 exists to make impossible.

```
auth_challenges                auth_sessions              auth_refresh_tokens
├── challenge_id               ├── session_id             ├── token_id
├── user_id                    ├── user_id                ├── session_id
├── credential_id              ├── created_at             ├── family_id
├── kind                       ├── expires_at             ├── token_hash
├── expires_at                 ├── revoked_at             ├── issued_at
├── attempts                   ├── revoke_reason          ├── expires_at
├── consumed_at                └── last_used_at           ├── consumed_at
└── created_at                                            ├── replaced_by
                                                          └── revoked_at
```

### S2 refresh flow

```
LOGIN                REFRESH                        REPLAY
password             R1                             R1 (again)
  ↓                    ↓ hash → lookup                ↓
challenges             session valid?                already consumed
  ↓                    user active?                   ↓
all satisfied          token unused?                 REPLAY DETECTED
  ↓                    token unexpired?               ↓
Session created        ↓                             revoke family + session
  ↓                    ATOMIC consume R1              ↓
Access + R1            ↓                             audit security event
                       issue R2 in same family        ↓
                       ↓                             DENY
                       new access token
```

**The precise hazard:** `consume R1` and `create R2` must be one transaction. Otherwise two
concurrent requests both observe R1 valid and issue R2 *and* R3 — a silent family fork that
defeats replay detection entirely.

**Access tokens stay short-lived and are NOT stored whole in the database.** Authoritative
long-lived security state lives in the session/refresh lifecycle, with re-checks at sensitive
points — not by turning every JWT verification into a database read.

### S2 acceptance tests

```
login                      → exactly one active session
refresh R1                 → R2 issued; R1 unusable
reuse R1                   → replay detected → family/session contained
two CONCURRENT R1 refreshes→ exactly ONE succeeds
logout                     → session revoked → every refresh in family unusable
deactivated user           → existing refresh rejected
expired refresh            → rejected
revoked session            → rejected
DB/API restart             → valid session survives; consumed/revoked stay consumed/revoked
two API replicas           → identical security semantics
```

The last two are the ones that actually prove process-local security state is gone.

```
S2  Sessions        auth_sessions · rotating refresh token · replay detection · revocation
S3  Membership      persisted tenant → company → project context (inventory FIRST)
S4  AccessService   extend existing scopes: company / warehouse / contract
S5  Enforcement     completeness across all suites
S6  Approval        authority · SoD · financial limits
S7  AI              principal propagation
S8  Verification
```

**Before S3 writes any table**, a forensic inventory is required, classifying each domain
A (already correct) / B (incomplete) / C (not enforced everywhere) / D (duplicate mechanism) /
E (missing) across: capability taxonomy, `AccessService` scopes, tenant membership, company
relation, project assignment, warehouse scope, communication ownership, finance approval
authority, AI principal. AURA already has `derivePermissionFromRoute` producing
`module.entity.action`, `AccessService` org-path + resource scoping, and `approvalLimit` on
grants — S3 should be consolidation, not a second authorization system.
