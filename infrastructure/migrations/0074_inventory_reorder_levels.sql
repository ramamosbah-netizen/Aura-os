-- ============================================================
-- AURA OS — migration 0074: Inventory reorder levels (min/max)
-- ------------------------------------------------------------
-- Adds a replenishment policy to stock items: reorder_level (the
-- trigger threshold; on-hand ≤ level → needs reordering) and
-- reorder_qty (suggested order quantity; 0 = top up to level).
-- ============================================================

alter table public.aura_inventory_stock_items
  add column if not exists reorder_level numeric(15,4) not null default 0,
  add column if not exists reorder_qty   numeric(15,4) not null default 0;
