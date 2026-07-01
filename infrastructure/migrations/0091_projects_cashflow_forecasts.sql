-- ============================================================
-- AURA OS — migration 0091: Project cash-flow forecasts
-- ------------------------------------------------------------
-- One forecast per project: monthly inflow/outflow periods (JSONB).
-- The summary computes net + running cumulative (funding S-curve)
-- and the peak funding requirement.
-- ============================================================

create table if not exists public.aura_projects_cashflow_forecasts (
  id           uuid        primary key default gen_random_uuid(),
  tenant_id    text        not null,
  company_id   text,
  project_id   uuid        not null,
  project_name text,
  periods      jsonb       not null default '[]'::jsonb,
  notes        text        not null default '',
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, project_id)
);
create index if not exists idx_projects_cashflow_tenant on public.aura_projects_cashflow_forecasts(tenant_id);

alter table public.aura_projects_cashflow_forecasts enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_projects_cashflow_forecasts;
create policy tenant_isolation_policy on public.aura_projects_cashflow_forecasts
  for all using (tenant_id = public.current_tenant_id());
