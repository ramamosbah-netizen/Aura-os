-- ============================================================
-- AURA OS — migration 0217: link WBS nodes to a BOQ item (the Progress Engine → Earned Value bridge)
-- ------------------------------------------------------------
-- Phase 3. A WBS work package can name the BOQ (measured) item that drives its progress. When set,
-- the Progress Engine syncs the node's progress = the item's physical % complete (installed / BOQ)
-- read off the Quantity Ledger, which recomputes earnedValue = plannedValue × progress — so Earned
-- Value / SPI / CPI flow automatically from site installation. Nullable + additive. Owned by projects.
-- ============================================================

alter table public.aura_projects_wbs_nodes add column if not exists boq_item_id text;

-- @DOWN
alter table public.aura_projects_wbs_nodes drop column if exists boq_item_id;
