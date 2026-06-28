-- ============================================================
-- AURA OS — migration 0020: Engineering Module
-- ------------------------------------------------------------
-- The engineering module owns these tables.
-- Namespaced under aura_engineering_*. Apply with `pnpm db:migrate`.
-- ============================================================

-- 1. Shop Drawings
create table if not exists public.aura_engineering_drawings (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  code         text        not null,
  title        text        not null,
  revision     text        not null default '0',
  status       text        not null default 'draft', -- draft | pending_approval | approved | rejected
  project_id   uuid        not null,
  project_name text,
  owner_id     text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, project_id, code, revision)
);

create index if not exists idx_aura_eng_drawings_project on public.aura_engineering_drawings (tenant_id, project_id);
alter table public.aura_engineering_drawings enable row level security;

-- 2. RFIs (Request For Information)
create table if not exists public.aura_engineering_rfis (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  code         text        not null,
  title        text        not null,
  question     text        not null,
  answer       text,
  status       text        not null default 'open', -- open | answered | closed
  project_id   uuid        not null,
  project_name text,
  assigned_to  text,
  owner_id     text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, project_id, code)
);

create index if not exists idx_aura_eng_rfis_project on public.aura_engineering_rfis (tenant_id, project_id);
alter table public.aura_engineering_rfis enable row level security;

-- 3. Material/Technical Submittals
create table if not exists public.aura_engineering_submittals (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  code         text        not null,
  title        text        not null,
  submittal_type text      not null,                -- material | technical | sample | drawing
  status       text        not null default 'draft', -- draft | submitted | approved | rejected
  project_id   uuid        not null,
  project_name text,
  owner_id     text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, project_id, code)
);

create index if not exists idx_aura_eng_submittals_project on public.aura_engineering_submittals (tenant_id, project_id);
alter table public.aura_engineering_submittals enable row level security;
