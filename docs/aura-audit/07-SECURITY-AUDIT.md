# 07 — Security Audit

The security *architecture* is a genuine strength; the residual risk is that **enforcement is precondition-gated on correct per-environment configuration**. ~~and that some perimeter controls (rate limiting, CORS) are absent~~ — **superseded at Rev 2: the perimeter controls now exist** (see below); what remains is verifying their per-environment *values*.

## Severity matrix

| Sev | Finding | Status | Evidence |
|---|---|---|---|
| **CRITICAL** | Production RLS/least-privilege posture unverified on staging/prod | `NOT VERIFIED` / `BLOCKED_BY_INFRASTRUCTURE` | `main.ts` RLS gate; `0163/0164`; live DB not inspectable here |
| **HIGH** | Authorization inert until JWT verifier configured (default off) | `BLOCKED_BY_CONFIGURATION` | `permissions.guard.ts:100`; `main.ts` auth posture |
| ~~**HIGH**~~ **RESOLVED (Rev 2)** | ~~No API rate limiting / brute-force protection~~ | `VERIFIED_IMPLEMENTED` | `EdgeRateLimitGuard` registered as a **global guard** — `apps/api/src/main.ts:59-60`; implementation + tests in `core/src/http/rate-limit.guard.ts` |
| ~~**MEDIUM**~~ **RESOLVED (Rev 2)** | ~~Permissive CORS (`enableCors()` no allowlist)~~ | `VERIFIED_IMPLEMENTED` (mechanism) · `NOT VERIFIED` (prod value) | `resolveCors({ allowedOrigins: process.env.CORS_ALLOWED_ORIGINS, isProduction })` with a boot warning — `main.ts:55-57`, `core/src/http/edge-security.ts:41` |
| **LOW** (Rev 2, new) | CSP + body-size cap now present | `VERIFIED_IMPLEMENTED` | `cspFor(...)` per-route CSP header (`main.ts:49`, `edge-security.ts:110`); `BODY_LIMIT` request cap |
| **MEDIUM** | Fine-grained role→permission grant breadth unverified | `NOT VERIFIED` | derivation covers routes; grants not audited |
| **MEDIUM** | File-upload validation (MIME/size/AV) not verified | `NOT VERIFIED` | `DOCUMENT_STORAGE` seam exists; validation depth unchecked |
| **LOW** | `ssl: { rejectUnauthorized: false }` for managed PG | `IMPLEMENTED_BUT_UNVERIFIED` | `pg-pool.ts:23` — pragmatic for Supabase, but disables cert validation |
| **INFO** | Dev default binds `tenantId:'dev-tenant'`, `actorId:null` | by design | `main.ts` — only active when auth off |

## Authentication (positive)

- **Fail-closed bootstrap:** `evaluateAuthPosture` makes it **fatal** to boot in production without a verifier (unless a loud `ALLOW_INSECURE_NO_AUTH=true` override). This is the correct posture — it converts "forgot to configure auth" from a silent data-exposure into a refused boot.
- JWT via JWKS (IdP/Supabase) or HS256 secret; secrets read through a `readSecret` vault seam (`*_FILE` supported) — no hardcoded credentials found in the sampled kernel/bootstrap.

## Authorization (positive)

- Global `PermissionsGuard` with route-derived `module.entity.action` taxonomy (`05`).
- Module-disable gate + deactivated-user gate enforced centrally.
- Object-level / org-path checks via `AccessService.assert(actorId, {permission, orgPath})`.

## Database security (positive, unverified in prod)

- **RLS gate at boot:** `evaluateRlsPosture` refuses production boot if the connection role has `rolsuper OR rolbypassrls` (unless `ALLOW_RLS_BYPASS=true`). The least-privilege `aura_app` role (`0163`) is what makes FORCE RLS bite.
- **Tenant-scoped pool:** GUC bound on every query/connection, reset on release, fail-closed (`08`).
- **Caveat:** this all depends on the *actual* production DB running under `aura_app`. Prior project state indicates RLS was enforced on **dev only**; staging/prod flip is **NOT VERIFIED** here. → **CRITICAL until proven.**

## Secrets

- No hardcoded credentials/API keys/tokens found in kernel, bootstrap, or sampled modules. Secrets via env/`readSecret` with `_FILE` mount support. (Full-tree secret scan recommended as a CI gate — `git-secrets`/`gitleaks` not verified present.)

## Injection / IDOR / mass assignment

- **SQL injection:** stores use parameterized queries (`$1,$2` seen in `tenant-scoped-pool.ts` and factory pattern); no string-concatenated SQL observed in the sampled kernel. Not exhaustively audited across 110 Postgres stores → `IMPLEMENTED_BUT_UNVERIFIED`.
- **IDOR:** mitigated by tenant GUC + RLS + service tenant guards; object-ownership within a tenant relies on `AccessService` org-path checks — spot-verified, not exhaustive.
- **Mass assignment:** mitigated by `ValidationPipe({whitelist:true})` stripping unknown fields.

## Recommendations (priority)

1. **P0:** verify and document that staging/prod connect as `NOBYPASSRLS aura_app` with FORCE RLS; add a startup assertion log to every environment.
2. **P0/ops:** ensure production sets `AUTH_JWKS_URL`/secret + `AUTH_REQUIRED=true`; treat the fail-closed gate as the backstop, not the plan.
3. ~~**P1:** add rate limiting and a `gitleaks` CI gate; tighten CORS.~~ **Rev 2: rate limiting and the CORS allowlist are DONE** (commit `2377a5a1`, `G-07` closed in `18`). **Still outstanding:** the `gitleaks` secret-scanning CI gate (`G-15`), and confirming `CORS_ALLOWED_ORIGINS` is actually set in each non-dev environment.
4. **P1:** verify upload MIME/size validation and signed-URL access for the DMS.
5. **P2:** consider real cert validation for managed PG (pin CA) instead of `rejectUnauthorized:false`.

**Security maturity score: 71/100** — architecturally excellent, operationally precondition-dependent, perimeter controls incomplete.
