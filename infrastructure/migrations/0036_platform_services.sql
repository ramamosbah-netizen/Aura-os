-- ============================================================
-- AURA OS — migration 0036: Platform Services Schema
-- ------------------------------------------------------------
-- Creates tables for resilient background job processing and 
-- dynamic per-tenant feature flags/configurations.
-- ============================================================

create table if not exists public.aura_background_jobs (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       text        not null,
  queue_name      text        not null default 'default',
  payload         jsonb       not null,
  status          text        not null default 'pending', -- 'pending', 'running', 'completed', 'failed'
  attempts        integer     not null default 0,
  max_attempts    integer     not null default 3,
  run_at          timestamptz not null default now(),
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.aura_feature_flags (
  flag_key        text        primary key,
  description     text,
  enabled_default boolean     not null default false,
  rules           jsonb       not null default '[]'::jsonb, -- e.g. [{"tenantId": "t1", "enabled": true}]
  updated_at      timestamptz not null default now()
);

alter table public.aura_background_jobs enable row level security;
alter table public.aura_feature_flags enable row level security;

-- Background jobs are isolated to the active tenant
create policy tenant_background_jobs_policy on public.aura_background_jobs
  for all
  using (tenant_id = public.current_tenant_id());

-- Feature flags are platform config; open to all active tenants
create policy global_feature_flags_policy on public.aura_feature_flags
  for all
  using (true);
