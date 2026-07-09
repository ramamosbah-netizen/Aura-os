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
- Route guard: `@Permissions('key')` + `PermissionsGuard`, registered as a global `APP_GUARD`.
- **DONE 2026-07-08 (gap #7 closed):** the taxonomy is `<module>.<entity>.<action>` and covers
  **every handler by construction** — when a route has no explicit decorator the guard derives
  the permission from its declared path (`POST crm/accounts` → `crm.account.create`,
  `POST …/:id/approve` → `finance.invoice.approve`; `derivePermissionFromRoute`, 9 tests).
  Explicit decorators override; health/auth/metrics exempt. Role storage is **DB-backed**
  (migration `0133_access_roles_grants`, write-through + hydrate-on-boot) and the
  role-management UI ships at `/admin/access`. Enforcement engages when auth is ON
  (staged pass-through preserved for dev).

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
- **Field-level PII encryption — DONE 2026-07-08 (gap #14 closed):** AES-256-GCM helpers in
  shared (`encryptField`/`decryptField`, versioned `enc:v1:` format, random IV, auth-tag
  fail-closed, legacy-plaintext passthrough; 8 tests), staged by `PII_ENCRYPTION_KEY` —
  identity function until the key is set. Applied at the storage boundary for the WPS
  identifiers (`iban`, `molEmployeeId` in the HR employee store); the domain/UI stay
  plaintext while the DB column holds ciphertext. Extend field-by-field as the PII
  catalog grows (same one-line pattern in each store).

## 5. Audit

✅ Strong: immutable append-only trail (actor, action, entity, before/after, tenant, time),
kernel-level so every module inherits it; `/admin/audit` viewer. Add for compliance: export,
retention policy, tamper-evidence (hash chaining) [P2].

## 6. Compliance

Target frames: UAE PDPL (primary market), GDPR-alignment, SOC 2 (Type I → II) for enterprise
sales. Current assets: audit immutability, tenant isolation design, data-residency option via
region-pinned Postgres. Formal program [Gap — post-GA].

## 7. MFA

**DONE 2026-07-08 (gap #13 closed).** RFC 6238 TOTP, library-only (shared `totp.ts`, RFC
vectors tested). Per-user enrolment **persists** (migration `0134_user_mfa`) with a
two-step flow — `POST /auth/mfa/enroll` parks the secret inactive, the first valid code
on `POST /auth/mfa/activate` switches it on — so an unscanned QR can never lock a user
out. An active enrolment **gates `POST /auth/login`** (code required; bad codes share the
brute-force lockout). WebAuthn remains the P2 follow-on. Entra/IdP users get MFA from
the IdP.

## 8. SSO

**DONE (accept-side) + group mapping DONE 2026-07-08 (gap #13 closed).** OIDC tokens from a
hosted IdP (Azure AD/Entra, Supabase) verify via `AUTH_JWKS_URL` (JWKS cache with rotation
retry). **Entra groups map to AURA roles** via `AUTH_GROUP_ROLE_MAP`
(`<group-id>=<role-id>` csv), applied idempotently on every verified token — grants ride
the DB-backed access store. SAML stays the P2 follow-on for legacy IdPs.

## 9. API Security

| Control | State |
|---|---|
| SQL injection | ✅ parameterized queries throughout (audited) |
| Input validation | ✅ global `ValidationPipe` (main.ts, class-validator DTOs) + enforced error taxonomy + `assertFormValid` running the form engine's `evaluateForm` server-side on every metadata-form endpoint (done 2026-07-08) |
| Idempotency | ✅ keys on spine creates (interceptor, tested) |
| Rate limiting | ✅ kernel `rate-limiter` (reliability) — needs per-route wiring [P2] |
| Webhook signing | ✅ outbound deliveries signed |
| CORS/headers | ◐ defaults; helmet/CSP hardening pass [P2] |
| OpenAPI-driven contract tests | ◐ OpenAPI spec now served (`/api/docs-json`); contract tests still to build [P2] |

## 10. Secrets — ✅ DONE 2026-07-09 (gap #3 closed)

The vault seam shipped: every process secret reads through `readSecret()`
(`shared/src/security/secret-source.ts`) honoring the `<NAME>_FILE` convention — Docker/K8s
secret mounts and vault CSI drivers (Azure Key Vault per Vol 19 §4) inject secrets with **zero
code changes**; plain env stays the dev fallback; an explicitly-set-but-unreadable mount fails
at boot (never runs open). Wired at every read site: `DATABASE_URL` (pool + migration runner),
`AUTH_JWT_SECRET`, `ANTHROPIC_API_KEY`, `PII_ENCRYPTION_KEY`. **Rotation:** staged PII key
rotation via `PII_ENCRYPTION_KEY_PREVIOUS` (decrypt-old / write-new); full inventory, rotation
windows, and the revocation drill in `docs/runbooks/secrets-rotation.md`. **CI secret scanning:**
gitleaks job fails any PR introducing a credential-shaped string; targeted history greps came
back clean (2026-07-09). Residual (operational, not code): rotate the dev Supabase/AI keys per
the runbook schedule since they have touched dev trees.

## 11. Consolidated security P-list

| # | Item | Sev | Status |
|--:|---|---|---|
| 1 | RLS enforcement bundle (least-priv role + GUC + FORCE RLS + isolation test) | P0 | scheduled final task |
| 2 | Auth ON by default + refresh/revocation + lockout | P0 | ✅ done 2026-07-07 |
| 3 | Secrets to vault + rotation + revoke exposed keys | P0 | ✅ done 2026-07-09 (`readSecret` `_FILE` seam + staged PII rotation + gitleaks CI + rotation runbook) |
| 4 | Permission taxonomy on all handlers + role storage → DB | P1 | ✅ done 2026-07-08 (route-derived coverage + migration 0133) |
| 5 | Global input-validation layer | P1 | ✅ done 2026-07-08 (error taxonomy + `assertFormValid` on all metadata-form endpoints) |
| 6 | Field-level PII encryption | P1 | ✅ done 2026-07-08 (AES-256-GCM at store boundary, `PII_ENCRYPTION_KEY`) |
| 7 | MFA (TOTP) | P1 | ✅ done 2026-07-08 (persisted enrolment + login gate, migration 0134) |
| 8 | SSO (OIDC) | P1 | ✅ done 2026-07-08 (JWKS accept + Entra group→role map) |
| 9 | Helmet/CSP + per-route rate limits | P2 | partial |
| 10 | Audit export/retention/hash-chain | P2 | base solid |

---

*Next: [Volume 8 — Database](vol-08-database.md)*
