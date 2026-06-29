-- ============================================================
-- AURA OS — migration 0022: Construction / Site Control Module
-- ------------------------------------------------------------
-- The site control module owns these tables.
-- Namespaced under aura_site_*. Apply with `pnpm db:migrate`.
-- ============================================================

-- 1. Daily Reports / Site Diary
create table if not exists public.aura_site_daily_reports (
  id               uuid        primary key,
  tenant_id        text        not null,
  company_id       text,
  project_id       uuid        not null,
  project_name     text,
  date             date        not null,
  work_description text        not null,
  manpower_count   integer     not null default 0,
  equipment_count  integer     not null default 0,
  status           text        not null default 'draft', -- draft | submitted
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, project_id, date)
);

create index if not exists idx_aura_site_reports_project on public.aura_site_daily_reports (tenant_id, project_id);
alter table public.aura_site_daily_reports enable row level security;

-- 2. Delay Logs
create table if not exists public.aura_site_delay_logs (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  project_id   uuid        not null,
  project_name text,
  date         date        not null,
  delay_type   text        not null, -- weather | material | access | drawings | other
  description  text        not null,
  impact_hours numeric     not null default 0,
  status       text        not null default 'logged', -- logged | resolved
  resolved_at  timestamptz,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_aura_site_delays_project on public.aura_site_delay_logs (tenant_id, project_id);
alter table public.aura_site_delay_logs enable row level security;

-- 3. Material Consumption
create table if not exists public.aura_site_material_consumption (
  id                uuid        primary key,
  tenant_id         text        not null,
  company_id        text,
  project_id        uuid        not null,
  project_name      text,
  date              date        not null,
  item_id           text        not null,
  item_name         text        not null,
  quantity_consumed numeric     not null default 0,
  unit              text        not null,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_aura_site_consumption_project on public.aura_site_material_consumption (tenant_id, project_id);
alter table public.aura_site_material_consumption enable row level security;
