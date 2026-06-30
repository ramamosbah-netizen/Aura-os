-- Subcontract variations — additions/omissions adjusting a subcontract's value on approval
CREATE TABLE IF NOT EXISTS public.aura_subcontracts_variations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       text NOT NULL,
  subcontract_id  uuid NOT NULL REFERENCES public.aura_subcontracts(id),
  reference       text NOT NULL,
  type            text NOT NULL CHECK (type IN ('addition','omission')),
  amount          numeric(16,2) NOT NULL CHECK (amount > 0),
  description     text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subcontracts_variations_tenant ON public.aura_subcontracts_variations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subcontracts_variations_sub ON public.aura_subcontracts_variations(subcontract_id);
CREATE INDEX IF NOT EXISTS idx_subcontracts_variations_status ON public.aura_subcontracts_variations(tenant_id, status);
