-- ============================================================
-- AURA OS — migration 0212: code purchase orders to a BOQ item (the ORDERED quantity strand)
-- ------------------------------------------------------------
-- The Quantity Ledger twin of the PO's cost coding (0204). A PO can name the BOQ (measured) item it
-- orders against, plus the ordered quantity + unit. When present, po.created posts +ordered to the
-- Quantity Ledger (and a cancellation reverses it) — the BOQ item's Ordered position is SUM(this),
-- never a manual number. All nullable + additive; an unmeasured PO orders no quantity. Owned by procurement.
-- ============================================================

alter table public.aura_procurement_purchase_orders add column if not exists boq_item_id text;
alter table public.aura_procurement_purchase_orders add column if not exists ordered_quantity numeric;
alter table public.aura_procurement_purchase_orders add column if not exists unit text;

-- @DOWN
alter table public.aura_procurement_purchase_orders drop column if exists unit;
alter table public.aura_procurement_purchase_orders drop column if exists ordered_quantity;
alter table public.aura_procurement_purchase_orders drop column if exists boq_item_id;
