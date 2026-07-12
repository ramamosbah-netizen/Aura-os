-- ============================================================
-- AURA OS — migration 0155: opportunity next-action due date
-- ------------------------------------------------------------
-- The Next-Action Invariant: every ACTIVE opportunity must carry a Next Action
-- + Due Date + Owner. `next_action` and `owner_id` already exist (0145); this
-- adds the due date so a missing/past-due step surfaces under "Needs Attention".
-- Additive, nullable — existing deals simply read as needing attention.
-- ============================================================

alter table public.aura_crm_opportunities
  add column if not exists next_action_due_date text;

-- @DOWN
alter table public.aura_crm_opportunities
  drop column if exists next_action_due_date;
