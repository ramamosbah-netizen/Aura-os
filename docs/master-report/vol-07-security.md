# Volume 7 — Security

[← Master index](README.md)

This volume is deliberately the most self-critical: the security *design* is sound and largely
built; the security *posture* is not production-ready because enforcement is gated off during
the build phase — a recorded, deliberate decision (RLS enforcement is the designated final task
after feature completeness). Every P0 below is scoped, not vague.

---

## 1. Authentication

| Aspect | State |
|---|---|
| Mechanism | JWT (HS-secret; JWKS support in `shared/identity/jwks.ts` for asymmetric) via `core/src/identity/auth.service.ts` |
| Enforcement | **Env-gated:** `AUTH_REQUIRED=true` + `AUTH_JWT_SECRET` ⇒ anonymous requests rejected (401) except health/auth. Default dev = open. Misconfiguration logs loudly (`AUTH_REQUIRED set but secret missing — running open`) |
| Login | `/login` page; dev convention: `u-admin` with any password when `AUTH_DEV_PASSWORD` unset |
| Sessions | Stateless JWT; **no refresh rotation, no revocation list** [P0 before GA] |
| Password policy / lockout | [Gap] |

**Required for GA:** flip enforcement default to ON, refresh-token rotation, revocation,
password policy, brute-force lockout.

## 2. Authorization (RBAC + ABAC)

- Engine: roles → permissions, grants per user, attribute conditions (tenant/company/ownership)
  — `core/src/identity/access.service.ts` + `shared/identity/access.ts`, guard tested.
- Route guard: `@Permissions('key')` + `PermissionsGuard` exist; **controllers are not yet
  annotated** — authorization currently rides service-level access checks.
- **Required for GA:** define the permission taxonomy (proposal: `<module>.<entity>.<verb>`,
  e.g. `finance.invoice.approve`), annotate all 551 handlers, move role storage from in-memory
  registration to the database, and ship role-management UI (Volume 15).

## 3. Tenant Isolation

| Layer | State |
|---|---|
| App level | ✅ `tenant-context` propagation; every business table carries `tenant_id`; all queries tenant-filtered |
| RLS policies | ✅ authored — migrations `0032_kernel_rls_policies`, `0049_dynamic_hierarchical_rls`, `0052` (87 tables covered) |
| RLS enforcement | ❌ **deliberately deferred** — the app currently connects via a role that bypasses RLS; no `FORCE ROW LEVEL SECURITY`; no per-request tenant GUC. This is the recorded final pre-production task |
| Company sub-scoping | `company_id` columns + hierarchical policy design (0049) |

**The enforcement task (scoped):** least-privilege app role → `SET LOCAL app.tenant_id` per
request (pool hook exists in `pg-pool.ts`) → `FORCE ROW LEVEL SECURITY` on all tenant tables →
cross-tenant integration test proving isolation.

## 4. Encryption

- In transit: TLS at the platform edge (Supabase/host) ✅.
- At rest: storage-provider encryption (Supabase default) ✅.
- **Field-level PII encryption** (salaries, IDs, bank details): [Gap — P1].

## 5. Audit

✅ Strong: immutable append-only trail (actor, action, entity, before/after, tenant, time),
kernel-level so every module inherits it; `/admin/audit` viewer. Add for compliance: export,
retention policy, tamper-evidence (hash chaining) [P2].

## 6. Compliance

Target frames: UAE PDPL (primary market), GDPR-alignment, SOC 2 (Type I → II) for enterprise
sales. Current assets: audit immutability, tenant isolation design, data-residency option via
region-pinned Postgres. Formal program [Gap — post-GA].

## 7. MFA

[Gap]. Design: TOTP first (library-only, no vendor), WebAuthn second; enforced per-tenant
policy via settings service (Volume 15 dependency).

## 8. SSO

[Gap]. Design: OIDC first (Azure AD/Entra — the GCC enterprise default), SAML second.
JWKS support in shared is the stepping stone. Required for government/semi-gov deals
(Volume 1 §5).

## 9. API Security

| Control | State |
|---|---|
| SQL injection | ✅ parameterized queries throughout (audited) |
| Input validation | ◐ hand-rolled guards + UUID pipe; **no global ValidationPipe/schema layer** [P1] — the form engine's server-side `evaluateForm` is the designed unification |
| Idempotency | ✅ keys on spine creates (interceptor, tested) |
| Rate limiting | ✅ kernel `rate-limiter` (reliability) — needs per-route wiring [P2] |
| Webhook signing | ✅ outbound deliveries signed |
| CORS/headers | ◐ defaults; helmet/CSP hardening pass [P2] |
| OpenAPI-driven contract tests | ❌ no OpenAPI yet [P2] |

## 10. Secrets

❌ **P0:** plaintext `.env.local` in dev including live service keys (flagged 2026-07-01, still
true). Required: vault/managed-secret store, key rotation, CI secret scanning, and revoking any
key that ever landed in a working tree.

## 11. Consolidated security P-list

| # | Item | Sev | Status |
|--:|---|---|---|
| 1 | RLS enforcement bundle (least-priv role + GUC + FORCE RLS + isolation test) | P0 | scheduled final task |
| 2 | Auth ON by default + refresh/revocation + lockout | P0 | designed |
| 3 | Secrets to vault + rotation + revoke exposed keys | P0 | not started |
| 4 | Permission taxonomy annotated on all handlers + role storage → DB | P1 | engine ready |
| 5 | Global input-validation layer | P1 | form-engine server evaluation is the path |
| 6 | Field-level PII encryption | P1 | not started |
| 7 | MFA (TOTP) | P1 | designed |
| 8 | SSO (OIDC) | P1 | designed |
| 9 | Helmet/CSP + per-route rate limits | P2 | partial |
| 10 | Audit export/retention/hash-chain | P2 | base solid |

---

*Next: [Volume 8 — Database](vol-08-database.md)*
