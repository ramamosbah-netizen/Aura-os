-- ============================================================
-- AURA OS — migration 0023: Health, Safety, and Environment (HSE) Module
-- ------------------------------------------------------------
-- The HSE module owns these tables.
-- Namespaced under aura_hse_*. Apply with `pnpm db:migrate`.
-- ============================================================

-- 1. HSE Incidents / Near Misses
create table if not exists public.aura_hse_incidents (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  project_id      uuid        not null,
  project_name    text,
  date            date        not null,
  severity        text        not null, -- near_miss | minor | major | fatal
  description     text        not null,
  location_detail text        not null,
  status          text        not null default 'reported', -- reported | investigating | closed
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_aura_hse_incidents_project on public.aura_hse_incidents (tenant_id, project_id);
alter table public.aura_hse_incidents enable row level security;

-- 2. Permits to Work (PTW)
create table if not exists public.aura_hse_ptws (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  project_id   uuid        not null,
  project_name text,
  permit_type  text        not null, -- hot_work | confined_space | height_work | electrical | excavation
  valid_from   timestamptz not null,
  valid_to     timestamptz not null,
  description  text        not null,
  status       text        not null default 'requested', -- draft | requested | approved | expired | closed
  approved_by  text,
  approved_at  timestamptz,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_aura_hse_ptws_project on public.aura_hse_ptws (tenant_id, project_id);
alter table public.aura_hse_ptws enable row level security;

-- 3. Corrective and Preventive Actions (CAPA)
create table if not exists public.aura_hse_capas (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  project_id      uuid        not null,
  project_name    text,
  source_type     text        not null, -- incident | audit | inspection
  source_id       uuid,
  action_required text        not null,
  assigned_to     text,
  due_date        date        not null,
  status          text        not null default 'pending', -- pending | in_progress | completed
  completed_at    timestamptz,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_aura_hse_capas_project on public.aura_hse_capas (tenant_id, project_id);
alter table public.aura_hse_capas enable row level security;
