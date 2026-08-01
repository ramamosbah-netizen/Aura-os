# Security Audit

**Score: 5.5 / 10** — the *mechanisms* are largely production-grade (5.5 undersells the design; it reflects that enforcement is staged OFF). This is the single biggest gap between how finished AURA OS looks and how enterprise-ready it is.

## Executive finding

> AURA OS has built excellent security machinery and left the master switch off. Authentication, permission enforcement, and tenant RLS are all present, tested, and CI-proven — but in the default/production posture they do not actually restrict access. Turning them on is the highest-value security work, and most of it is configuration, not construction.

## OWASP Top 10 pass

| # | Risk | Status | Evidence |
|---|---|---|---|
| A01 | Broken access control | ⚠️ **High** | `permissions.guard.ts`: `if (!this.auth.enabled) return true` — guard passes through with no verifier configured (dev default). RLS inert on prod runtime. |
| A02 | Cryptographic failures | ✅ Good | JWT verify/sign + JWKS rotation in `@aura/shared`; PII crypto seam (memory: P1 tier); `readSecret` `_FILE` vault seam. |
| A03 | Injection | ✅ Good | raw `pg` but **parameterized everywhere** ($1,$2…); interpolation only for constant column-lists (`${COLS}`), never user input. No string-concat SQL with user data found. |
| A04 | Insecure design | ✅ Good | threat-aware kernel: idempotency, outbox, fail-closed RLS, error taxonomy (no 500-leak). |
| A05 | Security misconfiguration | ⚠️ | auth off by default; RLS role misconfigured on prod; verify CORS/helmet/rate-limit in `main.ts`. |
| A06 | Vulnerable components | ⚠️ | `pnpm audit --prod` runs in CI **non-blocking** (`|| true`); known advisories (multer/xlsx/postcss) acknowledged, unpatched. |
| A07 | Auth failures | ⚠️ | strong when enabled (JWKS, revocation store, deactivated-user refusal, MFA gate per memory); disabled by default. |
| A08 | Data integrity failures | ✅ | secret-scan (gitleaks) blocks credential-shaped diffs; SDK drift gate; migration gate. |
| A09 | Logging & monitoring | ⚠️ | audit service + audit table (mig 0029) exist; no live monitoring/alert routing wired (see DevOps). |
| A10 | SSRF | ➖ | limited external fetch surface (JWKS, LLM providers, connectors). Review connector framework input handling. |

## 1. Authentication (strong design, staged off)

- `core/src/identity/auth.service.ts`: HS/asymmetric JWT verify, **JWKS cache with rotation** (`JwksCache`, 10-min TTL, key-miss refresh), Entra **group→role mapping** (`mapGroupsToRoles`), service accounts, token revocation store.
- MFA gate + PII encryption shipped in the P1 tier (memory: `p1-tier-closed`).
- **Gap:** `AUTH_REQUIRED` defaults off; with no verifier, `auth.enabled` is false and every guard/short-circuits to allow. The dev ergonomics are understandable; the risk is a production deploy that never flips it.

## 2. Authorization / RBAC

- **Route-derived permission taxonomy** (`permissions.guard.ts` `derivePermissionFromRoute`): `module.entity.action` computed from the controller/handler path, so ~600 handlers are guarded without per-route annotation. `@Permissions` overrides where needed. Org-path scoped `AccessService.assert` (tenant→company). Deactivated-user hard refusal. Module-disabled → 403.
- Derived RBAC + PG-backed RBAC + dynamic hierarchical RLS (mig 0049) is a genuinely sophisticated model.
- **Bug/smell:** duplicated `if (!this.auth.enabled) return true` block (twice in one method) — remove.
- **Risk:** because permissions are *derived* from routes, a route that doesn't fit the `module/entity/action` shape may silently derive the wrong permission or none. When auth is turned on, this needs a coverage audit against real traffic.

## 3. Tenant isolation / RLS

- Mechanism is correct and fail-closed (see Database Review §3). **117 tables** protected; `TenantScopedPool` binds the GUC per query.
- **Critical prod gap:** production runs on Supabase where the app connects as an owner/BYPASSRLS role → isolation not enforced where data lives. CI proves it works under `aura_app`; production must use that role. This is the top security remediation.

## 4. Secrets management

- `readSecret()` with `_FILE` indirection (Docker/K8s secret files) — no secrets in code.
- **gitleaks** secret-scan job blocks credential-shaped strings in diffs (CI `secret-scan`).
- `docker-compose.yml` requires `AUTH_JWT_SECRET` from `.env` (`:?` fail-fast), never committed.
- Runbook exists: `docs/runbooks/secrets-rotation.md`.
- ✅ This area is well-handled.

## 5. Audit & compliance

- Audit service + append-only audit table (mig 0029); immutable stakeholder audit (memory). PII crypto for sensitive fields.
- Repo is **public** (memory: `go-live-track`) — confirm no tenant data, secrets, or the blockers report are committed. The `.txt` files in root (`ir.txt`, `permid.txt`, `reqids.txt`) should be reviewed for sensitive content and likely git-ignored.

## 6. Dependency posture

- CI audit is **non-blocking**. For enterprise readiness, make `pnpm audit --prod` blocking above a severity threshold, or adopt Dependabot/Renovate with an SLA on high/critical.

## Prioritized remediations

| Priority | Action | Effort |
|---|---|---|
| **P0** | Provision a non-bypass DB role on prod (Supabase) and connect the API as it → RLS live | M |
| **P0** | Set `AUTH_REQUIRED=true` + configure a verifier in staging/prod; deploy-gate on it | S |
| **P0** | Audit permission derivation against real routes once auth is on | M |
| P1 | Make dependency audit blocking (high/critical) + Dependabot | S |
| P1 | Confirm global `ValidationPipe` (whitelist) + CORS/helmet/rate-limiting in `main.ts` | S |
| P1 | Review root `*.txt` files + connector-framework inputs for SSRF/leaks | S |
| P2 | Migrate error taxonomy off string-matching; add pen-test before GA | M |
| P2 | Remove duplicated `auth.enabled` branch | XS |
