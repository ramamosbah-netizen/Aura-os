# Runbook — Row-Level Security tenant isolation (Roadmap R1 / G-P0-1)

**Status:** enforcement mechanism (`0163`) **+ activation closure** (`0164` + runtime hardening + a full execution-path audit + CI runtime proof). The runtime is **proven to operate under the non-BYPASSRLS `aura_app` role** — API business flows, the outbox relay, cross-module reactors, projections and the demo seeder all run correctly under it, and RLS denies cross-tenant access.
**Activation:** one operator step — point the runtime `DATABASE_URL` at `aura_app` (exact procedure + rollback below). No unresolved runtime prerequisite remains.

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

## What `0164` does (activation-closure follow-up)

Auditing the runtime under the real `aura_app` role surfaced three things `0163` did not resolve. **The critical one:** `ENABLE ROW LEVEL SECURITY` applies to **every non-owner role** (FORCE only extends it to the *owner*), so a table with RLS **enabled but no policy** is **deny-all** for `aura_app`. Several tables were left in exactly that state by their creating migrations (on the assumption the app is a BYPASSRLS service role). `0163` excluded some from FORCE but left the pre-existing `ENABLE` in place — the deny-all trap.

`0164` fixes all three:

- **A. Disable RLS on the system / pre-tenant tables** — `aura_events`, `aura_users`, `aura_service_accounts`, `aura_webhook_subscriptions`, `aura_webhook_deliveries`. Enabled-with-no-policy, these were deny-all → the outbox relay could read **no** events (halting the whole engine, and every event-appending write), login/machine-auth were locked out, and webhooks were dead. They are genuinely system/pre-tenant/cross-tenant-worker tables; the correct state under a single app role is **RLS disabled** (isolation enforced in app code) — which is what "excluded" always meant.
- **B. `aura_document_versions`** — RLS enabled, **no `tenant_id`** (isolated via its parent document), so `0163` skipped it → deny-all. It is tenant-owned, so it gets a **parent-join** isolation policy (the pattern `0032` uses for journal/calendar children), not an exclusion.
- **C. `aura_workflow_definitions`** — a row is either a **global** template (`tenant_id = ''`, shared by all tenants — migration `0003`) or tenant-specific. `0163`'s canonical policy hides global rows and blocks the boot `WorkflowSeeder`. Replaced with `USING/WITH CHECK (tenant_id = current_tenant_id() OR tenant_id = '')` — per-tenant rows isolated, global templates shared. `aura_workflow_instances` (runtime rows, `tenant_id NOT NULL`) is untouched.

`rls-fitness.mjs` gains a permanent **deny-all guard** (any `aura_*` table RLS-enabled with zero policies fails the build), so this bug class cannot recur.

## Runtime hardening (activation closure)

Every DB access seam now binds the correct tenant, so isolation holds under `aura_app`:

- **`TenantScopedPool.query()`** — binds `app.current_tenant_id`/`_company_id` from the bound context and **RESETs before release** (reads are tenant-scoped; pooled connections never leak).
- **`TenantScopedPool.connect()`** — previously a pass-through hole. Now binds the ambient tenant to the session GUC on the checked-out client and resets on release. This scopes **every caller that owns its own transaction** — the numbering engine, journal/document/event stores, projection engine — which otherwise connect directly (bypassing `query()` and the tx runner) and would fail closed. (`bindTenantGuc`/`resetTenantGuc` are the shared helpers.)
- **`OutboxRelay`** — polls `aura_events` cross-tenant (that table is excluded), but restores each event's tenant via `TenantContext.run({tenantId: event.tenantId, …})` **before** publishing, so reactor / projection / webhook writes it triggers are RLS-scoped to that event's tenant. Multi-tenant batches never leak.
- **`ProjectionEngine`** — sets the tenant GUC **per event** (transaction-local) in both the live handler and the cross-tenant rebuild stream, so read-model writes land under the event's tenant.
- **`DemoSeeder`** — wraps its seed in `TenantContext.run({tenantId:'dev-tenant'})` so boot/admin seeding writes succeed under `aura_app`.
- **Fail closed:** `TenantContext.boundTenantId()` returns `null` (not `dev-tenant`) outside a request; the pool and `PostgresTxRunner` then set an **empty** GUC, so `current_tenant_id()` is NULL and RLS matches no rows.
- Wired at the single `PG_POOL` seam (`core/src/core.module.ts`); no business-module store changed.

## Execution-path classification (audit of every non-request DB path)

| Path | Class | How tenant is established |
|---|---|---|
| API request handlers | tenant-bound | `main.ts` binds `TenantContext.run()` per request; pool `query()`/tx runner set the GUC. |
| Numbering, journal/document/event stores | tenant-bound | own `BEGIN/COMMIT` on a `connect()`ed client — now GUC-bound by `TenantScopedPool.connect()`. |
| Outbox relay → cross-module reactors | tenant-bound (per event) | relay restores the event's tenant via `TenantContext.run()` before `bus.publish`. |
| Projection engine (live) | tenant-bound (per event) | per-event transaction-local GUC from `event.tenantId`. |
| Demo seeder (boot + admin) | tenant-bound | wrapped in `TenantContext.run({tenantId:'dev-tenant'})`. |
| Outbox relay `aura_events` poll | cross-tenant **system** | reads the excluded event ledger on the `aura_app` connection (RLS-off table); each row is then processed under its own restored tenant. |
| Projection **replay/rebuild** | cross-tenant **system** | streams all tenants' events on one connection, re-setting the per-event GUC before each write. |
| Webhook retry worker | cross-tenant **system** | timer over the excluded `aura_webhook_subscriptions`/deliveries; app-facing subscription CRUD filters by tenant. |
| Migrations (`migrate.mjs`) | pre-tenant / owner | run as the **owner**, never `aura_app` (DDL + cross-tenant). |
| Auth / service-account lookup | pre-tenant | `aura_users`/`aura_service_accounts` looked up before a tenant exists (excluded). |
| Workflow **global** templates | pre-tenant / shared config | `tenant_id=''` rows, readable by all tenants via the `0164` policy. |

No business/request path uses a privileged (owner/BYPASSRLS) connection — the runtime role is `aura_app` everywhere; only the migration/operator scripts use the owner role.

## Activation (exact operator procedure)

Do this at deploy time, against a **direct** (non-pooler) admin/owner connection.

1. **Apply migrations as the owner** (never `aura_app`): `pnpm --filter @aura/api db:migrate` (applies `0163` + `0164`).
2. **Grant the app role a login + password** (or attach `aura_app` to your existing restricted app role):
   ```sql
   ALTER ROLE aura_app LOGIN PASSWORD '<strong-secret>';
   ```
   On Supabase: create/enable a poolable custom role per their role guide, or map `aura_app` onto the project's `authenticated`-class role. Keep the secret in the vault (`DATABASE_URL_FILE` seam).
3. **Pre-flight verify** (still on the owner connection):
   `node apps/api/scripts/rls-fitness.mjs` → every in-scope table protected;
   `node apps/api/scripts/rls-isolation-test.mjs` → all assertions pass.
4. **Flip the runtime** `DATABASE_URL` to the `aura_app` DSN and restart the API. Migrations/ops scripts keep the **owner** DSN.
5. **Post-flip smoke** (as `aura_app`): create one record (e.g. `POST /api/v1/crm/accounts`), read it back, then confirm fail-closed at the DB:
   ```sql
   SELECT set_config('app.current_tenant_id','',false);
   SELECT count(*) FROM public.aura_crm_accounts;   -- must be 0
   SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user;  -- must be f
   ```
   (CI runs exactly this — see CI guards.)

Until step 4 the app runs as today (BYPASSRLS) with **no behavioural change** — the flip is the activation, and it is a single env var.

## Rollback (fast, safe)

The flip is reversible with no schema change:

1. **Immediate:** point `DATABASE_URL` back at the owner/`postgres` role and restart. RLS policies become inert again (owner is BYPASSRLS); the app behaves exactly as pre-activation. This is the whole rollback for an activation problem.
2. **Optional, remove enforcement entirely** (only if a policy itself is wrong): roll back the two migrations with their `@DOWN` blocks — `0164` restores the canonical workflow policy; `0163` drops `FORCE` on all tables and drops the `aura_app` role. Policies are left in place (harmless under BYPASSRLS). Use the migration-down tooling in the backup-dr runbook.
3. **Credential rotation:** `ALTER ROLE aura_app PASSWORD '<new>';` (or `NOLOGIN` to disable the role) — see secrets-rotation runbook.

## Exclusions — the tables + their exact trust boundary

These tables are **RLS-disabled** (or absent from RLS) for `aura_app`; each is reached only through a controlled system/pre-tenant path. Reviewed for the activation closure — every exclusion is kept because its access model genuinely requires cross-tenant/pre-tenant access, and its app-facing reads filter by tenant in code. (Before `0164` the first four were RLS-**enabled with no policy** = deny-all; `0164` disables RLS so they behave as the exclusion always intended.)

| Table | RLS state | Why | Trust boundary (what keeps it safe) |
|---|---|---|---|
| `aura_events` | disabled (0164) | The outbox relay **must** read pending rows across all tenants in one poll; RLS would hide them, and every write appends here. | Writes stamp `tenant_id` inside a tenant tx (`appendWithClient`). The relay is the only cross-tenant reader and processes each row under that row's restored tenant. App-facing reads (`PostgresEventStore.list`) filter by `tenant_id`; the dead-letter admin view is permission-gated. |
| `aura_users` | disabled (0164) | Login resolves a principal **before** any tenant context exists. | Lookups are by credential for authentication only; the users **admin registry** filters by tenant in the service layer. |
| `aura_service_accounts` | disabled (0164) | Machine authentication — pre-tenant, same as `aura_users`. | Looked up by client-id/secret at auth time only. |
| `aura_webhook_subscriptions`, `aura_webhook_deliveries` | disabled (0164) | The webhook **retry worker** runs on a timer with no request and redelivers due deliveries across tenants; `deliveries` has no `tenant_id`. | The dispatcher filters subscriptions by `event.tenantId`; app-facing subscription CRUD (`WebhookService`) filters by tenant. Candidate for future per-tenant enforcement (add `tenant_id` to deliveries → the worker iterates per tenant). |
| `aura_vector_store` | never enabled | AI embedding infra read/written by the guardrailed AI service, which may batch across tenants for indexing. | The AI service scopes every retrieval by `tenant_id`; no direct tenant-facing SQL. |

**Kept under RLS (NOT dropped to the exclusion list for convenience):**
- `aura_document_versions` — parent-join policy via `aura_documents` (`0164`); tenant-owned through its parent.
- `aura_workflow_definitions` — global-aware policy (`0164`): per-tenant rows isolated, `tenant_id=''` templates shared.

The fitness check keeps the disabled-table (EXCLUDED) list in lock-step and now also fails on any `aura_*` table that is RLS-enabled with **zero policies** (the deny-all trap) — so neither a new unprotected tenant table nor a new enabled-but-unpolicied system table can ship silently.

## CI guards (permanent regression protection)

`deploy-readiness` job (Postgres service), after the migration gate:
- **RLS fitness** — fails if any in-scope table lacks RLS/FORCE/policy.
- **RLS isolation** — mints an ephemeral `NOBYPASSRLS` role and asserts cross-tenant SELECT/INSERT/UPDATE/DELETE denial, fail-closed on missing context, no context leak, **the global-template (`tenant_id=''`) policy**, and **the relay per-event tenant switch on one connection**.
- **R1 activation (runtime proof)** — grants `aura_app` LOGIN, **boots the built API pointed at `aura_app`**, runs a real business write + read-back through the full spine (create → event append → outbox relay → tenant-scoped write), and proves DB-level fail-closed + that the runtime role cannot bypass RLS. This proves the app *runs* under the enforced role, not just that the policies exist.

Plus fast unit tests (no DB): `tenant-scoped-pool.test.ts` (query + `connect()` bind/reset/fail-closed) and `outbox-relay.test.ts` (per-event tenant restoration, multi-tenant, no leak).

## Residual risks / follow-ups (none block activation)

1. **Read latency.** The pool wrapper adds ~1–2 round-trips per pooled read/checkout (set + reset). Acceptable for correctness; consider a `SET LOCAL`-in-implicit-tx optimization or a read replica if hot paths regress.
2. **Supabase pooler + custom roles.** The isolation/activation proofs run against direct Postgres (CI). The Supabase transaction pooler cannot pool an arbitrary custom role, so validate the role switch against a **direct** connection (session-mode pooler or the direct 5432 endpoint).
3. **Excluded `aura_webhook_subscriptions` / `aura_vector_store`.** Both are excluded because a cross-tenant **system worker** legitimately needs them, and their app-facing reads filter by tenant. If those workers are later reworked to iterate per tenant, drop them from the exclusion list and fitness will require their protection.
