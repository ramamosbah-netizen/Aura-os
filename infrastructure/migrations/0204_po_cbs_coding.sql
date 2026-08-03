-- ============================================================
-- AURA OS — migration 0204: code purchase orders to a CBS cost line
-- ------------------------------------------------------------
-- The first strand of the Cost Engine: a PO can be coded to the CBS node (cost line) it is spent
-- against. When present, po.created accrues committed cost to THAT node — the CBS is the single
-- source of truth for cost, and the project summary is a derived rollup. Nullable + additive; an
-- uncoded PO simply accrues nowhere. Owned by procurement.
-- ============================================================

alter table public.aura_procurement_purchase_orders add column if not exists cbs_node_id text;

-- @DOWN
alter table public.aura_procurement_purchase_orders drop column if exists cbs_node_id;
