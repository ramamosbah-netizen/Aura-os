-- ============================================================
-- AURA OS — migration 0054: Inventory stock (on-hand + movements)
-- ------------------------------------------------------------
-- GRNs record receipts against POs; stock tracks what's actually
-- held. A stock item is an SKU at a warehouse with a running
-- on-hand quantity; every movement (in/out) adjusts it.
-- ============================================================

create table if not exists public.aura_inventory_stock_items (
  id               uuid          primary key,
  tenant_id        text          not null,
  company_id       text,
  code             text          not null,
  name             text          not null,
  unit             text          not null default 'pcs',
  warehouse        text          not null default 'Main',
  quantity_on_hand numeric(15,4) not null default 0,
  created_by       text,
  created_at       timestamptz   not null default now(),
  unique (tenant_id, code)
);
create index if not exists idx_aura_stock_items_tenant on public.aura_inventory_stock_items (tenant_id, warehouse);

create table if not exists public.aura_inventory_stock_movements (
  id            uuid          primary key,
  tenant_id     text          not null,
  stock_item_id uuid          not null references public.aura_inventory_stock_items(id) on delete cascade,
  direction     text          not null,
  quantity      numeric(15,4) not null,
  reason        text          not null,
  balance_after numeric(15,4) not null,
  created_at    timestamptz   not null default now()
);
create index if not exists idx_aura_stock_moves_item on public.aura_inventory_stock_movements (stock_item_id);

-- Tenant isolation (house pattern).
alter table public.aura_inventory_stock_items enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_inventory_stock_items;
create policy tenant_isolation_policy on public.aura_inventory_stock_items
  for all using (tenant_id = public.current_tenant_id());

alter table public.aura_inventory_stock_movements enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_inventory_stock_movements;
create policy tenant_isolation_policy on public.aura_inventory_stock_movements
  for all using (tenant_id = public.current_tenant_id());
