-- ============================================================
-- AURA OS — migration 0154: activity outcome
-- ------------------------------------------------------------
-- The Commercial Activity System captures WHAT HAPPENED — the outcome recorded
-- when a call/meeting/email is logged or a task is completed. Additive, nullable.
-- ============================================================

alter table public.aura_crm_activities add column if not exists outcome text;

-- @DOWN
alter table public.aura_crm_activities drop column if exists outcome;
