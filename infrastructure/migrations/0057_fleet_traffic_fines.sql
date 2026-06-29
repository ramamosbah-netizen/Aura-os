-- Fleet traffic fines (UAE) — violations charged against a vehicle, optionally assigned to a driver
CREATE TABLE IF NOT EXISTS public.aura_fleet_traffic_fines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          text NOT NULL,
  company_id         text,
  vehicle_id         uuid NOT NULL,
  driver_employee_id uuid,
  fine_number        text NOT NULL,
  violation          text NOT NULL,
  location           text NOT NULL DEFAULT '',
  amount             numeric(12,2) NOT NULL CHECK (amount > 0),
  black_points       integer NOT NULL DEFAULT 0 CHECK (black_points >= 0 AND black_points <= 24),
  fine_date          date NOT NULL,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','assigned','disputed','paid')),
  paid_date          date,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleet_fines_tenant ON public.aura_fleet_traffic_fines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fleet_fines_vehicle ON public.aura_fleet_traffic_fines(tenant_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fleet_fines_status ON public.aura_fleet_traffic_fines(tenant_id, status);
