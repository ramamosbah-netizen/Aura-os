-- ============================================================
-- AURA OS — migration 0009: Procurement purchase orders (operate-side module)
-- ------------------------------------------------------------
-- The Procurement module OWNS this table. A PO references a project by id + a name
-- snapshot (project_id / project_name) — no FK to the projects table, no cross-module
-- join. Namespaced `aura_procurement_*`. Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_procurement_purchase_orders (
  id            uuid        primary key,
  tenant_id     text        not null,
  company_id    text,
  reference     text,
  title         text        not null,
  supplier_name text,
  project_id    text,
  project_name  text,
  status        text        not null default 'draft',
  value         numeric     not null default 0,
  owner_id      text,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_aura_procurement_tenant  on public.aura_procurement_purchase_orders (tenant_id, created_at desc);
create index if not exists idx_aura_procurement_status  on public.aura_procurement_purchase_orders (status);
create index if not exists idx_aura_procurement_project on public.aura_procurement_purchase_orders (project_id);

alter table public.aura_procurement_purchase_orders enable row level security;
