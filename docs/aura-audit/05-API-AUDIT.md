# 05 — API Audit

## Surface (measured)

| Metric | Value |
|---|--:|
| Controllers | 99 |
| Endpoint decorators | 854 (GET 413 · POST 297 · PUT 62 · PATCH 55 · DELETE 27) |
| Global prefix | `/api/v1` (`main.ts`) |
| OpenAPI | `/api/docs` + `/api/docs-json` (`SwaggerModule`) |
| Typed client | `packages/sdk` (spec-generated, CI drift-gated) |

## Authentication — `VERIFIED_IMPLEMENTED` (config-gated)

Per-request middleware in `main.ts`: `auth.contextFromHeader(authorization)` verifies a bearer JWT (JWKS or HS256). Binds `{tenantId, companyId, actorId, correlationId}` into ALS via `tenant.run(...)`. When `AUTH_REQUIRED=true` (or production + verifier present), anonymous requests get **401** except a small public allowlist (`/health`, `/auth/login`, `/auth/status`). When no verifier is configured (dev default) requests pass through as a dev actor — **enforcement is off by default**.

## Authorization — `VERIFIED_IMPLEMENTED` (config-gated)

Global `APP_GUARD = PermissionsGuard` (`app.module.ts:158`, `core/src/identity/permissions.guard.ts`):

- **Auto-derives** `module.entity.action` from the route (`derivePermissionFromRoute`), e.g. `POST crm/accounts → crm.account.create`, `POST finance/invoices/:id/approve → finance.invoice.approve`. This covers the **entire ~600-handler surface** without per-route annotation — a notably strong design.
- **Module Manager gate:** a tenant-disabled module returns 403 for all its routes regardless of identity.
- **Deactivated-user gate:** a registered-but-deactivated actor is refused on every guarded request.
- **Staged pass-through:** the guard is a **no-op when `auth.enabled` is false** (dev). Enforcement engages the moment a verifier is configured.

Only 15/99 controllers carry an explicit `@Permissions` decorator — but this is **not** an under-protection signal, because derivation covers the rest. It *is* a signal that the fine-grained permission *taxonomy/seed data* should be audited for completeness (`07`).

## Tenant filtering — `VERIFIED_IMPLEMENTED`

Every DB read/write flows through `TenantScopedPool` (GUC binding) + RLS, plus service-layer tenant guards (`assertSameTenant`/`sameTenantOrNull`). See `08`.

## Validation — `VERIFIED_IMPLEMENTED`

Global `ValidationPipe({ transform, whitelist, forbidUnknownValues:false, exposeUnsetFields:false })` in `main.ts`. DTOs without class metadata are skipped (staged migration). Server-side form validation via `assertFormValid`/`evaluateForm` (`shared/src/forms`). Error taxonomy is enforced by a fitness test (`error-taxonomy.fitness.test.ts`) mapping domain errors to 400/403/404/409 (no 500-escape).

## Error handling — `VERIFIED_IMPLEMENTED`

`AllExceptionsFilter` + `AccessDeniedFilter` globally; `classifyDomainMessage` taxonomy; correlation ID on every response (`x-correlation-id`).

## Idempotency — `VERIFIED_IMPLEMENTED` (opt-in)

`IDEMPOTENCY_REQUIRED=true` enforces `Idempotency-Key` on 8 spine create routes (`main.ts` `SPINE_CREATES`), backed by `idempotency.service.ts` + a DB table.

## Weaknesses / gaps

| Finding | Status | Evidence |
|---|---|---|
| Enforcement off unless verifier configured | `BLOCKED_BY_CONFIGURATION` | `permissions.guard.ts:100`, `main.ts` posture gate |
| No rate limiting / throttling on the API | `MISSING` | no `@nestjs/throttler` / limiter in `main.ts` or modules |
| Fine-grained permission seed breadth unverified | `NOT VERIFIED` | derivation works; role→permission grants not exhaustively audited |
| Global search endpoint is O(all entities) per call | `PARTIALLY_IMPLEMENTED` | `search.service.ts` (`16`) |
| Pagination adopted additively, not universally | `PARTIALLY_IMPLEMENTED` | `*/paged` routes exist alongside unpaged `list` |
| CORS is `enableCors()` (permissive default) | `PARTIALLY_IMPLEMENTED` | `main.ts` — no explicit origin allowlist |

## Recommendations

1. **P1:** add rate limiting (per-IP + per-actor) before public exposure.
2. **P1:** tighten CORS to an explicit origin allowlist in production.
3. **P1:** audit the role→permission grant matrix for completeness against the derived taxonomy.
4. **P2:** finish pagination adoption on remaining list endpoints; replace search fan-out with a projection.

**API maturity score: 76/100** — mechanism is strong; deductions for missing rate limiting, permissive CORS, and config-gated enforcement.
