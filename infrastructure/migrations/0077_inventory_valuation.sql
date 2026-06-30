-- ============================================================
-- AURA OS — migration 0077: Inventory valuation (moving-average cost + COGS)
-- ------------------------------------------------------------
-- Stock items carry a moving-average (weighted-average) unit cost; movements record
-- the unit cost in (receipts) and the COGS out (issues = qty × avg cost at issue).
-- Inventory value = quantity_on_hand × avg_cost.
-- ============================================================

alter table public.aura_inventory_stock_items
  add column if not exists avg_cost numeric(18,4) not null default 0;

alter table public.aura_inventory_stock_movements
  add column if not exists unit_cost numeric(18,4) not null default 0,
  add column if not exists cogs      numeric(18,2) not null default 0;
