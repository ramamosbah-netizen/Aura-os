-- ============================================================
-- AURA OS — migration 0206: code stock movements to a project cost line
-- ------------------------------------------------------------
-- The Material strand of the Cost Engine. A stock movement issued to (out) / returned from (in) a
-- project carries that project's coding so the Transaction Engine can post its cost + quantity to
-- the CBS cost line: an issue is an ACTUAL cost (+qty), a return is a NEGATIVE actual (−qty). All
-- three columns are nullable + additive — a plain warehouse receipt (GRN) leaves them null and the
-- cost engine never reacts to it (its cost lives on the PO/invoice). Owned by inventory.
-- ============================================================

alter table public.aura_inventory_stock_movements add column if not exists project_id text;
alter table public.aura_inventory_stock_movements add column if not exists cbs_node_id text;
alter table public.aura_inventory_stock_movements add column if not exists boq_item_id text;

-- @DOWN
alter table public.aura_inventory_stock_movements drop column if exists boq_item_id;
alter table public.aura_inventory_stock_movements drop column if exists cbs_node_id;
alter table public.aura_inventory_stock_movements drop column if exists project_id;
