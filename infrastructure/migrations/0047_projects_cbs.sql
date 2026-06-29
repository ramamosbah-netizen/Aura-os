-- 0047: Projects — Cost Breakdown Structure (CBS)
-- CBS provides a hierarchical cost classification tree parallel to WBS.
-- While WBS tracks WHAT work is done, CBS tracks WHERE money goes by cost category.

CREATE TABLE IF NOT EXISTS public.aura_projects_cbs_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.aura_projects_projects(id),
  parent_id uuid REFERENCES public.aura_projects_cbs_nodes(id),
  code text NOT NULL,                    -- e.g. "01", "01.01", "01.01.03"
  title text NOT NULL,                   -- e.g. "Materials", "Steel Reinforcement"
  category text NOT NULL DEFAULT 'direct', -- 'direct' | 'indirect' | 'overhead' | 'contingency'
  budget_amount numeric NOT NULL DEFAULT 0,
  committed_amount numeric NOT NULL DEFAULT 0,  -- sum of PO/subcontract values
  actual_amount numeric NOT NULL DEFAULT 0,     -- sum of approved invoices/payments
  forecast_amount numeric NOT NULL DEFAULT 0,   -- projected final cost (EAC)
  variance numeric GENERATED ALWAYS AS (budget_amount - forecast_amount) STORED,
  currency text NOT NULL DEFAULT 'AED',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aura_projects_cbs_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbs_tenant_isolation ON public.aura_projects_cbs_nodes
  USING (tenant_id = current_setting('app.tenant_id', true));

-- Delay Analysis & EOT Claims
CREATE TABLE IF NOT EXISTS public.aura_projects_delay_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.aura_projects_projects(id),
  title text NOT NULL,
  cause_category text NOT NULL DEFAULT 'employer',  -- 'employer' | 'contractor' | 'neutral' | 'force_majeure'
  start_date date NOT NULL,
  end_date date,
  delay_days integer NOT NULL DEFAULT 0,
  is_concurrent boolean NOT NULL DEFAULT false,
  linked_activity_code text,             -- WBS code reference
  description text,
  status text NOT NULL DEFAULT 'identified',  -- 'identified' | 'analysed' | 'submitted' | 'approved' | 'rejected'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aura_projects_delay_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY delay_tenant_isolation ON public.aura_projects_delay_events
  USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE IF NOT EXISTS public.aura_projects_eot_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.aura_projects_projects(id),
  claim_number integer NOT NULL,
  title text NOT NULL,
  submitted_days integer NOT NULL,        -- days claimed
  approved_days integer DEFAULT 0,        -- days approved by employer
  status text NOT NULL DEFAULT 'draft',   -- 'draft' | 'submitted' | 'under_review' | 'approved' | 'partially_approved' | 'rejected'
  justification text,
  original_completion_date date,
  revised_completion_date date,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aura_projects_eot_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY eot_tenant_isolation ON public.aura_projects_eot_claims
  USING (tenant_id = current_setting('app.tenant_id', true));

-- Link delay events to EOT claims (many-to-many)
CREATE TABLE IF NOT EXISTS public.aura_projects_eot_delay_links (
  eot_claim_id uuid NOT NULL REFERENCES public.aura_projects_eot_claims(id),
  delay_event_id uuid NOT NULL REFERENCES public.aura_projects_delay_events(id),
  PRIMARY KEY (eot_claim_id, delay_event_id)
);
