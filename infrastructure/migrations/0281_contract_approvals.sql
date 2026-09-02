-- AURA OS — Contract revision/amendment approval records.
-- Uses the existing approval/access authority; this table is the durable decision evidence.
CREATE TABLE IF NOT EXISTS public.aura_contract_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  contract_id uuid NOT NULL,
  target text NOT NULL CHECK (target IN ('revision','amendment')),
  target_id uuid NOT NULL,
  submitted_by text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('pending','approved','returned','rejected')),
  decided_by text,
  decided_at timestamptz,
  comment text,
  UNIQUE (tenant_id, target, target_id)
);
CREATE INDEX IF NOT EXISTS idx_contract_approvals_tenant_contract ON public.aura_contract_approvals(tenant_id, contract_id);
ALTER TABLE public.aura_contract_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_contract_approvals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_contract_approvals;
CREATE POLICY tenant_isolation_policy ON public.aura_contract_approvals
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- @DOWN
drop table if exists public.aura_contract_approvals;
