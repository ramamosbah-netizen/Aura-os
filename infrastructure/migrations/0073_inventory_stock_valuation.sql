-- ============================================================
-- AURA OS — migration 0073: Inventory stock valuation (WAC)
-- ------------------------------------------------------------
-- Adds moving weighted-average cost to stock items and per-movement
-- cost capture: a receipt re-averages avg_cost; an issue draws down
-- at the running WAC (unit_cost = COGS rate). value_after = on-hand × WAC.
-- ============================================================

alter table public.aura_inventory_stock_items
  add column if not exists avg_cost numeric(15,4) not null default 0;

alter table public.aura_inventory_stock_movements
  add column if not exists unit_cost  numeric(15,4) not null default 0,
  add column if not exists value_after numeric(15,4) not null default 0;
