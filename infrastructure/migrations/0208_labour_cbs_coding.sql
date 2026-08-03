-- ============================================================
-- AURA OS — migration 0208: code site labour to a CBS cost line + carry its rate
-- ------------------------------------------------------------
-- The Labour strand of the Cost Engine. A daily labour allocation (headcount × hours = man-hours)
-- can now carry an all-in cost_rate (per man-hour) and be coded to a CBS node. When both are set,
-- the Transaction Engine posts labour_cost = man_hours × cost_rate as ACTUAL cost on that line
-- (with man-hours as the quantity). All additive; an uncoded / unrated allocation posts nothing.
-- Owned by site.
-- ============================================================

alter table public.aura_site_labour_allocations add column if not exists cost_rate numeric not null default 0;
alter table public.aura_site_labour_allocations add column if not exists labour_cost numeric not null default 0;
alter table public.aura_site_labour_allocations add column if not exists cbs_node_id text;

-- @DOWN
alter table public.aura_site_labour_allocations drop column if exists cbs_node_id;
alter table public.aura_site_labour_allocations drop column if exists labour_cost;
alter table public.aura_site_labour_allocations drop column if exists cost_rate;
