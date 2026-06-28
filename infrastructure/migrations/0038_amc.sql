-- ============================================================
-- AURA OS — migration 0038: AMC (Asset Management & Contracts)
-- ------------------------------------------------------------
-- Decoupled Service Module: Service Contracts, Work Orders,
-- Support Tickets, and SLA configuration.
-- ============================================================

-- Service Contracts
create table if not exists public.aura_amc_service_contracts (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      text        not null,
  company_id     text,
  contract_number text       not null,
  client_name    text        not null,
  asset_id       uuid,                -- Optional reference to an asset
  service_scope  text        not null, -- e.g. 'HVAC Maintenance', 'Elevator Servicing'
  start_date     date        not null,
  end_date       date        not null,
  value          numeric(18,2) not null default 0,
  currency       text        not null default 'AED',
  status         text        not null default 'active',   -- 'active' | 'expired' | 'terminated'
  sla_response_hours  integer not null default 4,
  sla_resolution_hours integer not null default 24,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Work Orders
create table if not exists public.aura_amc_work_orders (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      text        not null,
  company_id     text,
  contract_id    uuid        references public.aura_amc_service_contracts(id),
  order_number   text        not null,
  asset_id       uuid,
  description    text        not null,
  priority       text        not null default 'medium', -- 'low' | 'medium' | 'high' | 'critical'
  type           text        not null default 'corrective', -- 'preventive' | 'corrective' | 'inspection'
  status         text        not null default 'open',   -- 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
  assigned_to    text,                -- technician user ID
  scheduled_date date,
  completed_date date,
  location_lat   numeric(9,6),        -- GIS coordinates
  location_lng   numeric(9,6),
  location_label text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Support Tickets
create table if not exists public.aura_amc_tickets (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      text        not null,
  company_id     text,
  contract_id    uuid        references public.aura_amc_service_contracts(id),
  ticket_number  text        not null,
  title          text        not null,
  description    text        not null,
  category       text        not null default 'general',
  priority       text        not null default 'medium',
  status         text        not null default 'open',   -- 'open' | 'in_progress' | 'resolved' | 'closed'
  reported_by    text        not null,
  assigned_to    text,
  sla_due_at     timestamptz,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.aura_amc_service_contracts enable row level security;
alter table public.aura_amc_work_orders enable row level security;
alter table public.aura_amc_tickets enable row level security;

-- RLS Policies (tenant-isolated)
create policy amc_contracts_rls on public.aura_amc_service_contracts
  for all using (tenant_id = public.current_tenant_id());

create policy amc_work_orders_rls on public.aura_amc_work_orders
  for all using (tenant_id = public.current_tenant_id());

create policy amc_tickets_rls on public.aura_amc_tickets
  for all using (tenant_id = public.current_tenant_id());
