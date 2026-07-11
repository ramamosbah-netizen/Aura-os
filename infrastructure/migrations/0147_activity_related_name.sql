-- ============================================================
-- AURA OS — migration 0147: activity related-record name snapshot
-- ------------------------------------------------------------
-- Activities reference their deal-chain record by type + id; the name
-- snapshot (chain convention) lets the Activities page show and link
-- "Related to" without cross-module joins.
-- ============================================================

alter table public.aura_crm_activities
  add column if not exists related_name text;

-- @DOWN
alter table public.aura_crm_activities
  drop column if exists related_name;
