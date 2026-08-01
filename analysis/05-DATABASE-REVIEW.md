# Database Review

**Score: 7.5 / 10** — disciplined, idempotent, well-indexed, RLS-aware schema with excellent migration governance. Main risks: sparse foreign keys (integrity pushed to app code) and RLS being inert on the production runtime.

## 1. Scale & shape (measured across `infrastructure/migrations/*.sql`)

| Metric | Value |
|---|---|
| Migrations | 196 (sequential, gap-checked in CI) |
| Tables created | 192 |
| Indexes | 285 |
| RLS-enabled tables | 117 |
| FK / `references` clauses | **54** |
| Files with `@DOWN` rollback | 67 (policy requires it on *new* files only) |

## 2. Conventions (strong)

- **Namespacing:** `public.aura_<module>_<entity>` — every table is prefixed by owning module (e.g. `aura_crm_accounts`, `aura_finance_journals`). Enforces the "module owns its data" law by convention.
- **Idempotent DDL:** `create table if not exists`, `create index if not exists` — the full chain is re-runnable (CI proves "idempotent rerun applies nothing").
- **Standard columns:** `id uuid pk`, `tenant_id text not null`, `company_id text`, `created_by text`, `created_at timestamptz default now()`. Consistent audit/tenancy columns everywhere.
- **Tenant-first indexing:** `(tenant_id, created_at desc)` composite indexes are the default (e.g. `idx_aura_crm_accounts_tenant`) — matches the dominant "list latest N for tenant" query. Good.

## 3. Row-Level Security

- **117 tables** carry `enable row level security`. Migration 0032 defines `current_tenant_id()` / `current_company_id()` helpers reading either the session GUC (`app.current_tenant_id`) **or** the Supabase JWT claim (`request.jwt.claims`), then attaches tenant+company isolation policies in bulk.
- Dynamic hierarchical RLS (mig 0049) and per-table policies (e.g. finance bank transactions mig 0052) extend this.
- The runtime binding is correct and fail-closed (`core/src/events/tenant-scoped-pool.ts` sets the GUC per checkout; empty context → NULL tenant → zero rows).
- **The caveat (also in the Security Audit):** this is CI-proven under the non-bypass `aura_app` role, but the production Supabase connection uses an owner/bypass role, so **RLS does not actually isolate tenants in production today.** The mechanism is a loaded gun that isn't chambered.

## 4. Referential integrity — the main structural trade-off

Only **54 FK constraints across 192 tables.** Cross-module references are intentionally *not* FKs (modules own their data; you can't FK across a bounded context you might later extract). But integrity is thin even *within* modules — it is largely enforced in application services and **scanned after the fact** by `apps/api/scripts/orphan-scan.mjs` (+ `infrastructure/orphan-references.json`), which CI runs with `--enforce` on the seeded deal chain.

**Assessment:** defensible for extractability, but it means the database will not stop a bad write — a bug or a direct SQL statement can orphan records, and you only find out at the next scan. For financial tables especially, consider adding intra-module FKs (journal_lines → journals, invoice_lines → invoices) where extraction is not a concern.

## 5. Migration governance (excellent)

- `scripts/migration-policy-check.mjs` in CI: sequential, gap-free, `@DOWN` required on new files.
- **Boot-time drift gate** (`apps/api/src/health/migration-gate.service.ts`): if code is ahead of the DB, health returns **503 degraded** and business routes refuse with `SCHEMA_MIGRATION_PENDING` (503) rather than 500-ing on a missing column. CI actively proves this by un-recording the latest migration and asserting the degraded response.
- **Restore drill** in CI: seed → `pg_dump -Fc` → restore into fresh DB → `verify-restore.mjs` asserts per-table row-count parity. "A backup that isn't rehearsed doesn't exist" — and here it is rehearsed on every push.

## 6. Performance & normalization

- Schema is well-normalized; JSON columns used pragmatically for flexible payloads (event store, form overrides).
- **N+1 risk** is at the application layer, not the schema (see [`07-PERFORMANCE-AUDIT.md`](07-PERFORMANCE-AUDIT.md)) — the "no cross-module joins" law means composite views (e.g. account portfolio roll-up) are assembled in code across several queries.
- **Event store growth:** append-only, unbounded; archiver exists (`archive-events.mjs`) but no partitioning/retention policy is evident. Plan table partitioning for the event and audit tables before high volume.
- Indexes look purposeful (285 across 192 tables ≈ 1.5/table) and tenant-scoped; verify hot query paths (pipeline, GL, dashboards) have covering indexes via `EXPLAIN` under realistic data.

## Recommendations (ranked)

1. **Activate RLS on the production runtime** (dedicated non-bypass DB role for the app on Supabase) — the schema is ready; the connection isn't.
2. **Add intra-module FKs** for financial and other integrity-critical parent/child tables.
3. **Partition** event/audit/large-append tables; define retention + archival policy.
4. **`EXPLAIN`-audit hot read paths** under seeded-at-scale data; add covering indexes where roll-ups scan.
5. Keep the orphan-scan, but treat it as a safety net, not the primary integrity mechanism.
