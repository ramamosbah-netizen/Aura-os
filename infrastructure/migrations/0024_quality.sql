-- ============================================================
-- AURA OS — migration 0024: Quality Assurance / Control (Quality) Module
-- ------------------------------------------------------------
-- The Quality module owns these tables.
-- Namespaced under aura_quality_*. Apply with `pnpm db:migrate`.
-- ============================================================

-- 1. Non-Conformance Reports (NCR)
create table if not exists public.aura_quality_ncrs (
  id                  uuid        primary key,
  tenant_id           text        not null,
  company_id          text,
  project_id          uuid        not null,
  project_name        text,
  ncr_number          text        not null,
  description         text        not null,
  root_cause          text,
  proposed_correction text,
  severity            text        not null, -- minor | major
  status              text        not null default 'raised', -- raised | corrected | closed
  raised_by           text,
  assigned_to         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_aura_quality_ncrs_project on public.aura_quality_ncrs (tenant_id, project_id);
alter table public.aura_quality_ncrs enable row level security;

-- 2. Inspection Requests (IR)
create table if not exists public.aura_quality_irs (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  project_id      uuid        not null,
  project_name    text,
  ir_number       text        not null,
  discipline      text        not null, -- civil | mechanical | electrical | plumbing
  location_detail text        not null,
  inspection_date date        not null,
  status          text        not null default 'requested', -- requested | approved | rejected
  inspected_by    text,
  comments        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_aura_quality_irs_project on public.aura_quality_irs (tenant_id, project_id);
alter table public.aura_quality_irs enable row level security;

-- 3. Snagging / Punch List
create table if not exists public.aura_quality_snags (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  project_id      uuid        not null,
  project_name    text,
  description     text        not null,
  location_detail text        not null,
  severity        text        not null, -- low | medium | high
  status          text        not null default 'open', -- open | resolved | closed
  assigned_to     text,
  resolved_at     timestamptz,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_aura_quality_snags_project on public.aura_quality_snags (tenant_id, project_id);
alter table public.aura_quality_snags enable row level security;
