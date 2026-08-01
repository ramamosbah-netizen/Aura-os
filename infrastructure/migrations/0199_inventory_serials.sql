-- ============================================================
-- AURA OS — migration 0199: serialised inventory units
-- ------------------------------------------------------------
-- The per-unit ledger for serialised ELV stock — one row per physical device (camera,
-- controller, switch) by manufacturer serial. Warranty claims, asset registers, replacements
-- and recalls all key off "which exact unit is where", which quantity-based stock can't answer.
-- Owned by the inventory module; namespaced aura_inventory_*.
-- ============================================================

create table if not exists public.aura_inventory_serials (
  id                    uuid        primary key,
  tenant_id             text        not null,
  company_id            text,
  serial_number         text        not null,
  item_code             text        not null,
  item_name             text        not null,
  warehouse             text,
  grn_id                uuid,
  -- in_stock | issued | installed | returned | faulty
  status                text        not null default 'in_stock',
  project_id            uuid,
  project_name          text,
  location              text,
  installed_at          timestamptz,
  warranty_start_date   date,
  warranty_months       integer,
  notes                 text,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- A serial is unique per item within a tenant — the guard against double-registering a unit.
create unique index if not exists uq_aura_inventory_serials_serial
  on public.aura_inventory_serials (tenant_id, item_code, serial_number);
create index if not exists idx_aura_inventory_serials_status
  on public.aura_inventory_serials (tenant_id, status);
create index if not exists idx_aura_inventory_serials_project
  on public.aura_inventory_serials (tenant_id, project_id);

-- Tenant isolation, the enforced way (0163/0164) — enabled, FORCED, and policied.
alter table public.aura_inventory_serials enable row level security;
alter table public.aura_inventory_serials force row level security;

drop policy if exists tenant_isolation on public.aura_inventory_serials;
create policy tenant_isolation on public.aura_inventory_serials
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_inventory_serials;
