-- ============================================================
-- AURA OS — migration 0074: AMC PPM (Preventive Maintenance) Schedules
-- ------------------------------------------------------------
-- Completes AMC persistence: the PPM schedule entity (added after 0038) gets its
-- own table. A recurring plan attached to a service contract that generates
-- preventive work-order visits at a fixed frequency, advancing its next due date
-- each time a visit is generated.
-- ============================================================

create table if not exists public.aura_amc_ppm_schedules (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        text        not null,
  company_id       text,
  contract_id      uuid        not null references public.aura_amc_service_contracts(id),
  asset_id         uuid,
  task_description text        not null,
  frequency        text        not null,                 -- 'monthly' | 'quarterly' | 'semi_annual' | 'annual'
  start_date       date        not null,
  next_due_date    date        not null,
  active           boolean     not null default true,
  visits_generated integer     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_aura_amc_ppm_tenant   on public.aura_amc_ppm_schedules (tenant_id);
create index if not exists idx_aura_amc_ppm_contract on public.aura_amc_ppm_schedules (tenant_id, contract_id);

alter table public.aura_amc_ppm_schedules enable row level security;

create policy amc_ppm_rls on public.aura_amc_ppm_schedules
  for all using (tenant_id = public.current_tenant_id());

-- The SupportTicket domain carries the raw SLA response/resolution hours (sla_due_at is
-- derived from them); 0038 only stored the derived deadline. Add the source columns so a
-- persisted ticket round-trips faithfully.
alter table public.aura_amc_tickets
  add column if not exists sla_response_hours   integer not null default 4,
  add column if not exists sla_resolution_hours integer not null default 24;
