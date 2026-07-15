-- ============================================================
-- AURA OS — migration 0157: CRM Lead → Opportunity conversion lineage (S2)
-- ------------------------------------------------------------
-- Records the outcome of a Qualify & Convert: the opportunity a lead became and when.
-- A non-null converted_opportunity_id makes the lead terminal ('converted') and is the
-- guard behind the "cannot convert twice" invariant. Additive + nullable.
-- ============================================================

alter table public.aura_crm_leads
  add column if not exists converted_opportunity_id text,
  add column if not exists converted_at             timestamptz;

-- @DOWN
alter table public.aura_crm_leads
  drop column if exists converted_opportunity_id,
  drop column if exists converted_at;
