-- ============================================================
-- AURA OS — migration 0073: CRM Opportunity → Account link
-- ------------------------------------------------------------
-- Adds the account (client) reference + name snapshot to opportunities so the
-- head of the deal chain carries the client down to the auto-created
-- Tender → Contract → Project. Reference-by-id + snapshot, not a FK join
-- (consistent with the rest of the chain).
-- ============================================================

ALTER TABLE public.aura_crm_opportunities
  ADD COLUMN IF NOT EXISTS account_id   TEXT,
  ADD COLUMN IF NOT EXISTS account_name TEXT;

CREATE INDEX IF NOT EXISTS idx_aura_crm_opportunity_account
  ON public.aura_crm_opportunities (tenant_id, account_id);
