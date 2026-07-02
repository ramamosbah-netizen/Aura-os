-- ============================================================
-- AURA OS — migration 0112: Inventory costing method (WAC | FIFO)
-- ------------------------------------------------------------
-- Per-item costing method. FIFO items value issues (COGS) and remaining inventory from
-- cost layers replayed from movement history; the issue movement's unit_cost carries the
-- FIFO rate so the perpetual-inventory GL reactor posts Dr COGS / Cr Inventory at FIFO.
-- Existing rows default to 'wac' (unchanged behaviour).
-- ============================================================

alter table public.aura_inventory_stock_items
  add column if not exists costing_method text not null default 'wac';
