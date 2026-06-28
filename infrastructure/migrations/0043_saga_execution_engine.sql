-- ============================================================
-- AURA OS — migration 0043: Enterprise Execution Engine (Sagas)
-- ------------------------------------------------------------
-- Mapped to aura_kernel_sagas and aura_kernel_saga_steps.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_kernel_sagas (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT        NOT NULL,
  company_id     TEXT,
  saga_type      TEXT        NOT NULL, -- e.g. 'tendering.tender_awarded_saga'
  status         TEXT        NOT NULL, -- pending, running, completed, failed, compensating, compensated
  payload        JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aura_kernel_saga_steps (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            TEXT        NOT NULL,
  company_id           TEXT,
  saga_id              UUID        NOT NULL REFERENCES public.aura_kernel_sagas(id) ON DELETE CASCADE,
  step_name            TEXT        NOT NULL,
  status               TEXT        NOT NULL, -- pending, running, completed, failed, compensated
  action_payload       JSONB       NOT NULL DEFAULT '{}',
  compensation_payload JSONB       NOT NULL DEFAULT '{}',
  error_message        TEXT,
  executed_at          TIMESTAMPTZ,
  compensated_at       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_aura_saga_tenant ON public.aura_kernel_sagas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_aura_saga_status ON public.aura_kernel_sagas (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_aura_saga_step_saga ON public.aura_kernel_saga_steps (saga_id);

-- Enable RLS
ALTER TABLE public.aura_kernel_sagas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_kernel_saga_steps ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY kernel_sagas_rls ON public.aura_kernel_sagas
  FOR ALL USING (tenant_id = public.current_tenant_id());

CREATE POLICY kernel_saga_steps_rls ON public.aura_kernel_saga_steps
  FOR ALL USING (tenant_id = public.current_tenant_id());
