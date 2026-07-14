# Runbook — Row-Level Security tenant isolation (Roadmap R1 / G-P0-1)

**Status:** enforcement mechanism shipped (migration `0163` + runtime hardening + CI guards).
**Activation:** requires one operator step — point the runtime `DATABASE_URL` at the non-bypass `aura_app` role (below).

---

## Why this exists (live-tree re-audit, 2026-07-14)

A machine inventory of the live database found tenant isolation was **not actually enforced**:

- the runtime connects as **`postgres`** — `rolbypassrls = true`. **A BYPASSRLS role ignores every RLS policy**, so all existing policies were **inert** for the application.
- **`FORCE ROW LEVEL SECURITY` was set on 0 of 149** tenant-scoped business tables. Without FORCE, RLS does not apply to a table's owner either.
- Reads (`store.get/list`) call `pool.query` **directly**, bypassing the transaction runner that was the only place setting the tenant GUC — so a read under an enforced role had **no** tenant context.
- `TenantContext.get()` returned a **`dev-tenant` default** when unbound — absent context silently mapped to a real tenant instead of failing closed.

Net: isolation depended entirely on application `WHERE tenant_id = $1` filtering. R1 makes it **database-enforced and fail-closed**.

## RLS coverage — before / after

| Metric (tenant-scoped `public.aura_*` tables, 5 excluded) | Before | After 0163 |
|---|---|---|
| In scope | 149 | 149 |
| RLS **enabled** | 128 | **149** |
| RLS **FORCED** | **0** | **149** |
| Has a tenant policy | 127 | **149** |
| Runtime role bypasses RLS | **yes** (`postgres`, BYPASSRLS) | **no** (once `DATABASE_URL` → `aura_app`) |

Verify live at any time: `node apps/api/scripts/rls-fitness.mjs` (exit 1 lists any unprotected table).

## What `0163` does (additive, idempotent)

1. Creates a least-privilege role **`aura_app`** — `NOSUPERUSER NOBYPASSRLS NOLOGIN` — with `SELECT/INSERT/UPDATE/DELETE` on `public` tables + `EXECUTE` on the tenant helper functions (+ default privileges for future objects). `NOLOGIN` so **no credential is committed**.
2. `ENABLE` + **`FORCE ROW LEVEL SECURITY`** on every tenant-scoped `aura_*` table (except the exclusions below).
3. Adds the canonical fail-closed policy to any such table **missing** one:
   `USING/WITH CHECK (tenant_id = current_tenant_id() AND current_tenant_id() IS NOT NULL)`.
   Existing `tenant_isolation_policy` (127 tables) and the projects `hierarchical_isolation_policy` are **left intact** (permissive policies OR together — adding a broader one would widen access).

It changes nothing for the current BYPASSRLS runtime; isolation activates on the role switch.

## Runtime hardening (this PR)

- **`TenantScopedPool`** (`core/src/events/tenant-scoped-pool.ts`) wraps the shared pool: every pooled `query()` binds `app.current_tenant_id`/`app.current_company_id` from the **bound request** context and **RESETs before releasing** the connection — reads are now tenant-scoped and pooled connections cannot leak tenant identity across requests.
- **Fail closed:** `TenantContext.boundTenantId()` returns `null` (not `dev-tenant`) outside a request; the pool and `PostgresTxRunner` then set an **empty** GUC, so `current_tenant_id()` is NULL and RLS matches no rows.
- Wired at the single `PG_POOL` seam (`core/src/core.module.ts`); no business module changed.

## Activation (operator step — do this at deploy time)

1. Apply migrations: `pnpm --filter @aura/api db:migrate` (applies `0163`).
2. Grant the app role a login + password (or attach it to your existing restricted role):
   ```sql
   ALTER ROLE aura_app LOGIN PASSWORD '<strong-secret>';
   ```
   On Supabase, create/enable a poolable custom role per their role guide, or map `aura_app` onto the project's `authenticated`-class role.
3. Point the runtime **`DATABASE_URL`** at `aura_app` (keep migrations running as the owner/`postgres` — see Exclusions/Controlled paths).
4. Verify: `node apps/api/scripts/rls-fitness.mjs` → green; `node apps/api/scripts/rls-isolation-test.mjs` → all assertions pass.

Until step 3, the app keeps working as today (BYPASSRLS) with **no behavioural change** — the switch is the activation.

## Exclusions (intentional, justified)

These tenant-scoped tables are **not** force-isolated for `aura_app`; they are reached through controlled system paths:

| Table | Justification |
|---|---|
| `aura_events` | Event store. The outbox relay polls **cross-tenant** on a timer via the owner/system connection (a controlled path). Consumers filter by the event's `tenant_id`. |
| `aura_users`, `aura_service_accounts` | Authentication looks up the principal **before** any tenant context exists (login is pre-tenant). |
| `aura_webhook_subscriptions` | System integration config, delivered by a system worker. |
| `aura_vector_store` | AI embedding infrastructure accessed only via the guardrailed AI service. |

The fitness check keeps this list in lock-step (`apps/api/scripts/rls-fitness.mjs`), so an accidental new table is caught, and the exclusions are explicit rather than silent.

## Controlled privileged paths (must NOT go through `aura_app`)

- **Migrations** (`apps/api/scripts/migrate.mjs`) — run as the owner/`postgres`; DDL + cross-tenant.
- **Outbox relay / background jobs / seeders** — run outside a request scope; under `aura_app` they fail closed. They must either (a) run within a `TenantContext.run({tenantId})` bound to the event's tenant, or (b) use the owner/system connection. **Prerequisite for full activation** — see Residual risks.

## CI guards (permanent regression protection)

`deploy-readiness` job (Postgres service), after the migration gate:
- **RLS fitness** — fails if any in-scope table lacks RLS/FORCE/policy (new unprotected table ⇒ red build).
- **RLS isolation** — mints an ephemeral `NOBYPASSRLS` role + table and asserts cross-tenant SELECT/INSERT/UPDATE/DELETE denial, fail-closed on missing context, and no context leak.

Plus a fast unit test (`core/src/events/tenant-scoped-pool.test.ts`) covering the wrapper's fail-closed + reset-on-release logic (no DB needed).

## Residual risks / follow-ups (not blockers to merge; gate full activation)

1. **System-op tenant context.** Before switching the runtime to `aura_app`, ensure the outbox relay/reactors/seeders establish `TenantContext` per event (or use the owner connection); otherwise those writes fail closed. Verifying/wiring this is the activation prerequisite.
2. **Read latency.** The pool wrapper adds ~2 round-trips per pooled read (set + reset). Acceptable for correctness; consider a `SET LOCAL`-in-implicit-tx optimization or a read replica if hot paths regress.
3. **Supabase pooler + custom roles.** The isolation test cannot run through the Supabase transaction pooler with an arbitrary role (pooler auth needs the project identifier); it runs in CI's direct Postgres. Validate the role switch against a direct connection.
4. **Excluded tables.** `aura_vector_store`/`aura_webhook_subscriptions` are excluded pragmatically; revisit once their access paths set tenant context, then remove from the exclusion list (fitness will then require their protection).
