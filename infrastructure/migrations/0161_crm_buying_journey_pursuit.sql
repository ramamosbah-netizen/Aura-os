-- ============================================================
-- AURA OS — migration 0161: Customer Buying Journey + Pursue/No-Pursue (S6)
-- ------------------------------------------------------------
-- buying_stage tracks where the CUSTOMER is in their own process (vs. our sales stage) so
-- AURA can flag when we are running ahead of the buyer. The pursuit_* columns record the
-- Pursue / No-Pursue call (kept even when NO_PURSUE — a rejected pursuit is history, not deleted).
-- Additive + nullable.
-- ============================================================

alter table public.aura_crm_opportunities
  add column if not exists buying_stage        text,
  add column if not exists pursuit_decision    text,
  add column if not exists pursuit_score        integer,
  add column if not exists pursuit_rationale    text,
  add column if not exists pursuit_decided_by   text,
  add column if not exists pursuit_decided_at   timestamptz,
  add column if not exists pursuit_dimensions   jsonb;

-- @DOWN
alter table public.aura_crm_opportunities
  drop column if exists buying_stage,
  drop column if exists pursuit_decision,
  drop column if exists pursuit_score,
  drop column if exists pursuit_rationale,
  drop column if exists pursuit_decided_by,
  drop column if exists pursuit_decided_at,
  drop column if exists pursuit_dimensions;
