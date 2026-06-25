-- ============================================================
-- AURA OS — migration 0011: Finance invoices (operate-side module)
-- ------------------------------------------------------------
-- The Finance module OWNS this table. A (supplier/AP) invoice bills against a Purchase
-- Order: it references the PO by id + title snapshot (po_id / po_title) and carries the
-- supplier + project snapshots down from it — no FK, no cross-module join. Namespaced
-- `aura_finance_*`. Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_finance_invoices (
  id            uuid        primary key,
  tenant_id     text        not null,
  company_id    text,
  reference     text,
  title         text        not null,
  po_id         text,
  po_title      text,
  supplier_name text,
  project_id    text,
  project_name  text,
  status        text        not null default 'draft',
  value         numeric     not null default 0,
  owner_id      text,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_aura_finance_tenant  on public.aura_finance_invoices (tenant_id, created_at desc);
create index if not exists idx_aura_finance_status  on public.aura_finance_invoices (status);
create index if not exists idx_aura_finance_po      on public.aura_finance_invoices (po_id);
create index if not exists idx_aura_finance_project on public.aura_finance_invoices (project_id);

alter table public.aura_finance_invoices enable row level security;
