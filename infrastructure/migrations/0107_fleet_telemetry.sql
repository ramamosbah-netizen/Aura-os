-- ============================================================
-- AURA OS — migration 0107: Fleet GPS Telematics
-- ------------------------------------------------------------
-- Namespaced under aura_fleet_*. Apply with `pnpm db:migrate`.
-- ============================================================

-- Add last location/telemetry columns to aura_fleet_vehicles
alter table public.aura_fleet_vehicles add column if not exists last_latitude numeric(9,6);
alter table public.aura_fleet_vehicles add column if not exists last_longitude numeric(9,6);
alter table public.aura_fleet_vehicles add column if not exists last_speed numeric(5,2);
alter table public.aura_fleet_vehicles add column if not exists last_odometer integer;
alter table public.aura_fleet_vehicles add column if not exists last_telemetry_at timestamptz;

-- Create telemetry logs table
create table if not exists public.aura_fleet_telemetry_logs (
  id           uuid        primary key,
  tenant_id    text        not null,
  vehicle_id   uuid        not null references public.aura_fleet_vehicles(id) on delete cascade,
  latitude     numeric(9,6) not null,
  longitude    numeric(9,6) not null,
  speed        numeric(5,2) not null,
  odometer     integer,
  recorded_at  timestamptz not null default now()
);

create index if not exists idx_aura_fleet_telemetry_vehicle on public.aura_fleet_telemetry_logs (tenant_id, vehicle_id);

alter table public.aura_fleet_telemetry_logs enable row level security;

drop policy if exists tenant_isolation_policy on public.aura_fleet_telemetry_logs;

create policy tenant_isolation_policy on public.aura_fleet_telemetry_logs
for all
using (
  tenant_id = public.current_tenant_id()
);
