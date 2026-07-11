-- ============================================================
-- AURA OS — migration 0148: tender deadline + deal-chain provenance
-- ------------------------------------------------------------
-- Tenders get the two fields the register needs: the client submission
-- deadline (drives "due soon" urgency on the tenders page) and the source
-- opportunity reference (set by the won-opportunity reactor).
-- ============================================================

alter table public.aura_tendering_tenders
  add column if not exists submission_deadline date,
  add column if not exists source_opportunity_id uuid;

-- @DOWN
alter table public.aura_tendering_tenders
  drop column if exists source_opportunity_id,
  drop column if exists submission_deadline;
