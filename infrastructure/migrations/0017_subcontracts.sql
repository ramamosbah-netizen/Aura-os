-- ============================================================
-- AURA OS — migration 0017: Subcontracts & Claims
-- ------------------------------------------------------------
-- The Subcontracts module OWNS these tables.
-- Namespaced `aura_subcontracts_*`. Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_subcontracts (
  id                   uuid        primary key,
  tenant_id            text        not null,
  project_id           uuid        not null,
  project_name         text,
  title                text        not null,
  subcontractor_name   text        not null,
  status               text        not null default 'draft',
  value                numeric     not null default 0,
  retention_percentage numeric     not null default 10,
  created_at           timestamptz not null default now()
);

create table if not exists public.aura_subcontracts_claims (
  id                         uuid        primary key,
  tenant_id                  text        not null,
  subcontract_id             uuid        not null,
  claim_number               integer     not null,
  status                     text        not null default 'draft',
  work_completed_value       numeric     not null default 0,
  previously_certified_value numeric     not null default 0,
  this_period_gross_value    numeric     not null default 0,
  retention_withheld         numeric     not null default 0,
  net_certified_value        numeric     not null default 0,
  certified_at               timestamptz,
  certified_by               text,
  created_at                 timestamptz not null default now()
);

create index if not exists idx_aura_subcontracts_tenant  on public.aura_subcontracts (tenant_id, created_at desc);
create index if not exists idx_aura_subcontracts_project on public.aura_subcontracts (project_id);

create index if not exists idx_aura_subcontracts_claims_tenant on public.aura_subcontracts_claims (tenant_id);
create index if not exists idx_aura_subcontracts_claims_subcontract on public.aura_subcontracts_claims (subcontract_id, claim_number);

alter table public.aura_subcontracts enable row level security;
alter table public.aura_subcontracts_claims enable row level security;
