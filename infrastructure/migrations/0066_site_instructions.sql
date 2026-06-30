-- Site instructions — formal on-site instructions (SI) with cost/time-implication flags
CREATE TABLE IF NOT EXISTS public.aura_site_instructions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        text NOT NULL,
  company_id       text,
  project_id       uuid NOT NULL,
  project_name     text,
  reference        text NOT NULL,
  issued_by        text NOT NULL,
  date             date NOT NULL,
  instruction      text NOT NULL,
  cost_implication boolean NOT NULL DEFAULT false,
  time_implication boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','closed')),
  acknowledged_at  timestamptz,
  closed_at        timestamptz,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_instructions_tenant ON public.aura_site_instructions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_instructions_project ON public.aura_site_instructions(tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_site_instructions_status ON public.aura_site_instructions(tenant_id, status);
