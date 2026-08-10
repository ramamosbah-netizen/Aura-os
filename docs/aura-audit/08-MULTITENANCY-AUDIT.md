# 08 — Multi-tenancy & Isolation Audit

Multi-tenancy is **defense-in-depth** and is the platform's best-engineered concern. Isolation is enforced at **three** layers.

## Layer 1 — Application (tenant context)

`TenantContext` (ALS) is populated per request in `main.ts` from the verified JWT (`{tenantId, companyId, actorId}`) and propagated to workers via `TenantContext.run(...)`. Service-layer guards (`assertSameTenant`/`sameTenantOrNull`, `tenant-guard.ts`) reject cross-tenant object references (used across finance and other modules).

## Layer 2 — Connection (tenant-scoped pool) — `VERIFIED_IMPLEMENTED`

`core/src/events/tenant-scoped-pool.ts` wraps the pg `Pool` so that:

- **Every `query()`** checks out a client, runs `set_config('app.current_tenant_id', tid)` + `app.current_company_id`, executes, then **resets** the GUC before release.
- **Every `connect()`** (used by stores that own their own `BEGIN/COMMIT`: numbering, journal, document, event store, projections) binds the same session GUC and wraps `release()` to reset it.
- **Fail-closed:** no bound tenant ⇒ GUC `''` ⇒ `current_tenant_id()` is NULL ⇒ RLS predicates match **no rows**.
- **No cross-request leak:** GUC reset-on-release means a pooled physical connection never carries one request's tenant into the next.

This closes the classic hole where direct `pool.query` reads (list/get) bypass the transaction runner and would otherwise run tenant-less.

## Layer 3 — Database (RLS) — `VERIFIED_IMPLEMENTED` in code, `NOT VERIFIED` in prod

- 128 migrations touch RLS; `0163_enforce_rls_tenant_isolation.sql` + `0164_rls_activation_closure.sql` enable+FORCE RLS with predicate `tenant_id = current_tenant_id()` and create the least-privilege `aura_app` role (NOSUPERUSER/NOBYPASSRLS).
- Boot-time `evaluateRlsPosture` refuses production if the connection role bypasses RLS.
- **Caveat:** RLS is *inert* if the runtime connects as a superuser/BYPASSRLS role. Whether staging/prod actually run under `aura_app` is **NOT VERIFIED** here (runtime/ops state). Prior project state: enforced on **dev only**. → this is the platform's #1 production blocker.

## Multi-company / multi-* capabilities

| Capability | Status | Evidence |
|---|---|---|
| Multi-tenant | `VERIFIED_IMPLEMENTED` (code) | tenant GUC + RLS + guards |
| Multi-company | `VERIFIED_IMPLEMENTED` | `app.current_company_id` GUC; finance `company_id`; consolidation/eliminations tests in `modules/finance/dist/domain/*` |
| Multi-currency / FX | `VERIFIED_IMPLEMENTED` | `core/src/finance/exchange-rate.service.ts`, finance `fx-revaluation` domain + tests |
| Multi-branch | `PARTIALLY_IMPLEMENTED` | org-path levels (`tenant`/`company`) exist; branch level not confirmed |
| Multi-country / tax jurisdictions | `PARTIALLY_IMPLEMENTED` | finance `tax-store`/`TaxService` (VAT) present; multi-jurisdiction breadth unverified |
| Multi-language (i18n) | `NOT VERIFIED` / likely `MISSING` | no i18n framework observed in `apps/web` |
| Timezone handling | `NOT VERIFIED` | not audited |
| Data residency / region pinning | `MISSING` | single-DB deployment model |

## Isolation bypass analysis

| Vector | Mitigation | Residual |
|---|---|---|
| Direct `pool.query` read tenant-less | TenantScopedPool binds GUC on query & connect | None if RLS enforced |
| Pooled connection carries prior tenant | reset-on-release | None |
| Worker/reactor runs tenant-less | `TenantContext.run()` before connect | None (per code) |
| Runtime as superuser ⇒ RLS inert | boot RLS posture gate | **CRITICAL** until prod role verified |
| App bug omits `WHERE tenant_id` | RLS is the net | Depends on RLS being live |

## Findings

- **Strength:** the isolation runtime is genuinely well-designed and defends even against app-layer omissions — *provided RLS is live*.
- **P0:** verify+prove the production DB role posture. Everything else in the tenancy story is sound.

**Multi-tenancy maturity score: 83/100** (would be ~90 with verified prod RLS; i18n/residency gaps cap it).
