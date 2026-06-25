-- ============================================================
-- AURA OS — migration 0010: Inventory goods receipts (operate-side module)
-- ------------------------------------------------------------
-- The Inventory module OWNS this table. A GRN records goods received against a Purchase
-- Order: it references the PO by id + title snapshot (po_id / po_title) and carries the
-- supplier + project snapshots down from it — no FK, no cross-module join. Namespaced
-- `aura_inventory_*`. Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_inventory_grns (
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
  status        text        not null default 'received',
  value         numeric     not null default 0,
  owner_id      text,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_aura_inventory_tenant  on public.aura_inventory_grns (tenant_id, created_at desc);
create index if not exists idx_aura_inventory_status  on public.aura_inventory_grns (status);
create index if not exists idx_aura_inventory_po      on public.aura_inventory_grns (po_id);
create index if not exists idx_aura_inventory_project on public.aura_inventory_grns (project_id);

alter table public.aura_inventory_grns enable row level security;
