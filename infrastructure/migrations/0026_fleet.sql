-- ============================================================
-- AURA OS — migration 0026: Fleet Module
-- ------------------------------------------------------------
-- The Fleet module owns these tables.
-- Namespaced under aura_fleet_*. Apply with `pnpm db:migrate`.
-- ============================================================

-- 1. Fleet Vehicles & Heavy Equipment
create table if not exists public.aura_fleet_vehicles (
  id                  uuid        primary key,
  tenant_id           text        not null,
  company_id          text,
  make                text        not null,
  model               text        not null,
  year                integer     not null,
  plate_number        text        not null,
  registration_expiry date,
  status              text        not null default 'active', -- active | maintenance | retired
  driver_employee_id  uuid,       -- driver link
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_aura_fleet_vehicles_tenant on public.aura_fleet_vehicles (tenant_id);
alter table public.aura_fleet_vehicles enable row level security;

-- 2. Fuel Log
create table if not exists public.aura_fleet_fuel_logs (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  vehicle_id      uuid        not null references public.aura_fleet_vehicles(id) on delete cascade,
  date            date        not null,
  liters          numeric(10,2) not null,
  cost            numeric(10,2) not null,
  odometer        integer     not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_aura_fleet_fuel_logs_vehicle on public.aura_fleet_fuel_logs (tenant_id, vehicle_id);
alter table public.aura_fleet_fuel_logs enable row level security;

-- 3. Maintenance Records
create table if not exists public.aura_fleet_maintenance (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  vehicle_id      uuid        not null references public.aura_fleet_vehicles(id) on delete cascade,
  date            date        not null,
  description     text        not null,
  cost            numeric(10,2) not null default 0.00,
  status          text        not null default 'scheduled', -- scheduled | completed
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_aura_fleet_maintenance_vehicle on public.aura_fleet_maintenance (tenant_id, vehicle_id);
alter table public.aura_fleet_maintenance enable row level security;
