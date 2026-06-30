-- ============================================================
-- AURA OS — migration 0077: Fleet Salik (toll) charges
-- ------------------------------------------------------------
-- Dubai road-toll charges against a fleet vehicle, recorded from
-- the monthly Salik statement. Lifecycle: recorded → allocated
-- (to a cost owner) | disputed.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_fleet_salik_charges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  company_id    text,
  vehicle_id    uuid NOT NULL,
  plate_number  text NOT NULL DEFAULT '',
  gate          text NOT NULL,
  charge_date   date NOT NULL,
  charge_time   text NOT NULL DEFAULT '',
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  status        text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','allocated','disputed')),
  allocated_to  text NOT NULL DEFAULT '',
  notes         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleet_salik_tenant ON public.aura_fleet_salik_charges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fleet_salik_vehicle ON public.aura_fleet_salik_charges(tenant_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_salik_status ON public.aura_fleet_salik_charges(tenant_id, status);

-- Tenant isolation (house pattern).
ALTER TABLE public.aura_fleet_salik_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_fleet_salik_charges;
CREATE POLICY tenant_isolation_policy ON public.aura_fleet_salik_charges
  FOR ALL USING (tenant_id = public.current_tenant_id());
