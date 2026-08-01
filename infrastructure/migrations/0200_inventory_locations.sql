-- ============================================================
-- AURA OS — migration 0200: warehouse / bin storage locations
-- ------------------------------------------------------------
-- The bin-code register — where stock physically lives (bin/rack/shelf/floor/yard/van) within a
-- named warehouse/store. ELV contractors run several stores (main store, each site's container,
-- engineers' vans); this is how pickers and stock-counters find material. Owned by inventory.
-- ============================================================

create table if not exists public.aura_inventory_locations (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  warehouse    text        not null,
  bin_code     text        not null,
  description  text,
  -- bin | rack | shelf | floor | yard | van
  type         text        not null default 'bin',
  active       boolean     not null default true,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- A bin code is unique per warehouse within a tenant.
create unique index if not exists uq_aura_inventory_locations_bin
  on public.aura_inventory_locations (tenant_id, warehouse, bin_code);
create index if not exists idx_aura_inventory_locations_wh
  on public.aura_inventory_locations (tenant_id, warehouse);

alter table public.aura_inventory_locations enable row level security;
alter table public.aura_inventory_locations force row level security;

drop policy if exists tenant_isolation on public.aura_inventory_locations;
create policy tenant_isolation on public.aura_inventory_locations
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_inventory_locations;
