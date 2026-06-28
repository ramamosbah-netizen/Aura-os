-- ============================================================
-- AURA OS — migration 0025: HR and Payroll (HR) Module
-- ------------------------------------------------------------
-- The HR module owns these tables.
-- Namespaced under aura_hr_*. Apply with `pnpm db:migrate`.
-- ============================================================

-- 1. Employees Registry
create table if not exists public.aura_hr_employees (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  first_name      text        not null,
  last_name       text        not null,
  email           text,
  phone           text,
  role            text        not null,
  department      text        not null,
  status          text        not null default 'active', -- active | suspended | terminated
  joined_date     date        not null,
  visa_expiry     date,
  permit_expiry   date,
  labor_camp      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_aura_hr_employees_tenant on public.aura_hr_employees (tenant_id);
alter table public.aura_hr_employees enable row level security;

-- 2. Leave Management
create table if not exists public.aura_hr_leaves (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  employee_id     uuid        not null references public.aura_hr_employees(id) on delete cascade,
  leave_type      text        not null, -- annual | sick | unpaid
  start_date      date        not null,
  end_date        date        not null,
  status          text        not null default 'pending', -- pending | approved | rejected
  reason          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_aura_hr_leaves_employee on public.aura_hr_leaves (tenant_id, employee_id);
alter table public.aura_hr_leaves enable row level security;

-- 3. Payroll Runs
create table if not exists public.aura_hr_payroll_runs (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  employee_id     uuid        not null references public.aura_hr_employees(id) on delete cascade,
  period_start    date        not null,
  period_end      date        not null,
  basic_salary    numeric(15,2) not null default 0.00,
  allowances      numeric(15,2) not null default 0.00,
  deductions      numeric(15,2) not null default 0.00,
  net_salary      numeric(15,2) not null default 0.00,
  status          text        not null default 'draft', -- draft | approved | paid
  processed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_aura_hr_payroll_runs_employee on public.aura_hr_payroll_runs (tenant_id, employee_id);
alter table public.aura_hr_payroll_runs enable row level security;
