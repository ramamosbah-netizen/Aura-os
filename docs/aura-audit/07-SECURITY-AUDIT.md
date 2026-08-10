# 07 — Security Audit

The security *architecture* is a genuine strength; the residual risk is that **enforcement is precondition-gated on correct per-environment configuration**, and that some perimeter controls (rate limiting, CORS) are absent.

## Severity matrix

| Sev | Finding | Status | Evidence |
|---|---|---|---|
| **CRITICAL** | Production RLS/least-privilege posture unverified on staging/prod | `NOT VERIFIED` / `BLOCKED_BY_INFRASTRUCTURE` | `main.ts` RLS gate; `0163/0164`; live DB not inspectable here |
| **HIGH** | Authorization inert until JWT verifier configured (default off) | `BLOCKED_BY_CONFIGURATION` | `permissions.guard.ts:100`; `main.ts` auth posture |
| **HIGH** | No API rate limiting / brute-force protection | `MISSING` | no throttler in `main.ts`/modules |
| **MEDIUM** | Permissive CORS (`enableCors()` no allowlist) | `PARTIALLY_IMPLEMENTED` | `main.ts` |
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
3. **P1:** add rate limiting and a `gitleaks` CI gate; tighten CORS.
4. **P1:** verify upload MIME/size validation and signed-URL access for the DMS.
5. **P2:** consider real cert validation for managed PG (pin CA) instead of `rejectUnauthorized:false`.

**Security maturity score: 71/100** — architecturally excellent, operationally precondition-dependent, perimeter controls incomplete.
