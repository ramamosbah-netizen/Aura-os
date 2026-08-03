-- ============================================================
-- AURA OS — migration 0213: code goods receipts to a BOQ item (the RECEIVED quantity strand)
-- ------------------------------------------------------------
-- The Quantity Ledger's Received position. A GRN can name the BOQ (measured) item it receives goods
-- against, plus the received quantity + unit. When present, grn.created posts +received to the
-- Quantity Ledger — the BOQ item's Received position is SUM(this). The gap Ordered − Received is
-- what is still in transit. All nullable + additive; an unmeasured GRN receives no quantity.
-- Owned by inventory.
-- ============================================================

alter table public.aura_inventory_grns add column if not exists boq_item_id text;
alter table public.aura_inventory_grns add column if not exists received_quantity numeric;
alter table public.aura_inventory_grns add column if not exists unit text;

-- @DOWN
alter table public.aura_inventory_grns drop column if exists unit;
alter table public.aura_inventory_grns drop column if exists received_quantity;
alter table public.aura_inventory_grns drop column if exists boq_item_id;
