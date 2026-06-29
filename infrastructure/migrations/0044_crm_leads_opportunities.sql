-- ============================================================
-- AURA OS — migration 0044: CRM Leads & Opportunities
-- ------------------------------------------------------------
-- Mapped to aura_crm_leads and aura_crm_opportunities.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_crm_leads (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT        NOT NULL,
  company_id     TEXT,
  name           TEXT        NOT NULL,
  company_name   TEXT,
  email          TEXT,
  phone          TEXT,
  status         TEXT        NOT NULL DEFAULT 'new', -- new, contacted, qualified, nurturing, disqualified
  source         TEXT,                               -- website, referral, campaign, cold_call
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aura_crm_opportunities (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT           NOT NULL,
  company_id      TEXT,
  lead_id         UUID           REFERENCES public.aura_crm_leads(id) ON DELETE SET NULL,
  title           TEXT           NOT NULL,
  value           NUMERIC(15, 4) NOT NULL DEFAULT 0,
  stage           TEXT           NOT NULL DEFAULT 'qualification', -- qualification, proposal, negotiation, won, lost
  win_probability NUMERIC(5, 2)  NOT NULL DEFAULT 20.0,            -- 0 to 100
  close_date      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_aura_crm_lead_tenant ON public.aura_crm_leads (tenant_id);
CREATE INDEX IF NOT EXISTS idx_aura_crm_opportunity_tenant ON public.aura_crm_opportunities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_aura_crm_opportunity_stage ON public.aura_crm_opportunities (tenant_id, stage);

-- Enable RLS
ALTER TABLE public.aura_crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_crm_opportunities ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY crm_leads_rls ON public.aura_crm_leads
  FOR ALL USING (tenant_id = public.current_tenant_id());

CREATE POLICY crm_opportunities_rls ON public.aura_crm_opportunities
  FOR ALL USING (tenant_id = public.current_tenant_id());
