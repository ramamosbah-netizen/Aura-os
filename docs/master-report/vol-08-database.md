# Volume 8 — Database

[← Master index](README.md)

PostgreSQL, shared-schema multi-tenant. **Verified 2026-07-03:** 146 `aura_*` tables ·
1,788 columns · 223 indexes · 126 sequential migrations (duplicate-number fail-fast guard in
the runner) · RLS enabled on tenant tables (enforcement deferred — Volume 7 §3).

> **Full table-by-table data dictionary: [Volume 8A](vol-08a-data-dictionary.md)** —
> generated from the migrations (columns, definitions, source migration, RLS, index counts).

---

## 1. ERD (bounded-context view)

Deliberate design: modules do **not** foreign-key into each other's tables — cross-context
references are *snapshots* (id + denormalized name), consistency by events. So the honest ERD
is a constellation of context clusters joined by the event stream, not one giant graph:

```
 kernel: aura_kernel_events ─ aura_events_dead_letter ─ aura_audit_log
         aura_workflow_* ─ aura_documents/document_* ─ aura_webhook_*
         aura_number_series ─ aura_notifications ─ aura_saved_views
         aura_calendar_* ─ aura_builder_* ─ aura_approval_* ─ aura_feature_flags
         aura_idempotency_keys ─ aura_background_jobs ─ aura_projection_*/snapshots

 crm(6) → [events] → tendering(6) → [events] → contracts(4) → [events] → projects(10)
                                                                   │
 procurement(6) ⇄ inventory(4)                                     │ cost events
        │  3-way match         └── COGS/GRNI journals ──► finance(19: GL,AP,AR,…)
 subcontracts(4) ── IPC/backcharge ──────────────────────►   ▲
 amc(4) ── work-order billing ───────────────────────────────┘
 hr(8) · site(5) · quality(7) · hse(6) · fleet(6) · engineering(5) · doccontrol(5) · assets(3+)
 ai/intelligence(4+): autonomy proposals, pricing, vector store, digital-* projections
```

Table distribution by prefix (counted from migrations): finance 19 · projects 10 · hr 8 ·
quality 7 · tendering/procurement/hse/fleet/crm 6 each · site/engineering/doccontrol 5 ·
subcontracts/inventory/contracts/amc/ai 4 · assets 3 · kernel families ~20.

## 2. Tables — conventions (every table follows these, verified on samples)

```sql
create table if not exists public.aura_crm_accounts (
  id          uuid primary key,
  tenant_id   text not null,          -- multi-tenancy: on EVERY business table
  company_id  text,                   -- multi-company sub-scope
  ...business columns...,
  status      text not null default '…',   -- CHECK-constrained lifecycle
  created_by  text,
  created_at  timestamptz not null default now()
);
```

- Naming: `aura_<module>_<entity>` (plural); indexes `idx_aura_<table>_<purpose>`.
- Line items: **JSONB** columns (quotation/invoice/PO lines) — document-shaped aggregates
  stay atomic with their header.
- Soft delete standardized in `0125_soft_delete_standardization.sql` (+0116 for customer
  invoices).
- Money: numeric columns + currency codes; FX conversion in the kernel service.

## 3. Indexes

223 indexes; standard pattern per table: `(tenant_id, created_at desc)` for tenant-scoped
listing + status/foreign-lookup indexes (`(status)`, `(project_id)` etc.). Composite covering
indexes for hot reads (aging, stock lookups). No index-bloat audit yet [P2].

## 4. Constraints

- **CHECK** constraints on enum-like statuses and non-negative amounts.
- **Double-entry enforcement at the database**: a trigger validates journal debit=credit on
  post — the platform's most important invariant lives below the app (verified by the live-pg
  integration test).
- **Duplicate-migration guard**: runner fails fast on duplicate numbers (added after the AMC
  collision incident, 2026-06-30).
- NOT NULL discipline on tenant/ownership columns.

## 5. Relationships

Only **1 hard FK** (by design — snapshot-not-join across contexts; ADR-0001 documents the FK
policy). Inside a context, parent-child integrity is app-enforced with idempotent writes.
Tradeoff accepted: referential integrity rests on service code + events; mitigations are the
audit trail, idempotency keys, and reconciliation projections. A periodic orphan-scan job is
[Planned — P2].

## 6. Migration

- 126 files, strictly sequential (`0001`–`0126`), one concern each, applied via `pnpm db:migrate`.
- Header comments state ownership ("The CRM module OWNS this table").
- RLS enablement + policies ship *with* the tables (0032/0049 dynamic policy generation).
- **Down-migrations: none** [Gap — P2]. Policy decision required: forward-only with
  point-in-time restore (recommended, matches Supabase PITR) vs authored down scripts.

## 7. Partitioning

None yet — correct for current volumes. Designed candidates when scale demands:
`aura_kernel_events` (by month — append-only, largest table), `aura_audit_log` (by month),
telemetry (`aura_fleet_telemetry` by month). All three are insert-heavy, time-keyed, and
query-recent — textbook range-partition fits. Trigger point: >50M rows or relay-lag SLO breach.

## 8. Archiving

[Gap — P2]. Design: closed-period financial data stays hot (statements need it); events/audit
beyond N months roll to cold storage via the OLAP export path (`core/projections/olap-export`),
with the dead-letter and replay tooling keeping archival safe.

---

*Next: [Volume 9 — API Documentation](vol-09-api.md)*
