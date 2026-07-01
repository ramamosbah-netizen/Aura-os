-- ============================================================
-- AURA OS — migration 0104: HSE risk assessments (JSA)
-- ------------------------------------------------------------
-- Controlled hazard assessment per activity: hazards (jsonb) scored likelihood × severity
-- (1–25), with initial/residual scores and a residual band (low/medium/high/critical).
-- ============================================================

create table if not exists public.aura_hse_risk_assessments (
  id             uuid primary key,
  tenant_id      text not null,
  company_id     text,
  project_id     text not null,
  project_name   text,
  reference      text not null,
  activity       text not null,
  assessor       text,
  hazards        jsonb not null default '[]'::jsonb,
  initial_score  integer not null default 0,
  residual_score integer not null default 0,
  residual_band  text not null default 'low',
  status         text not null default 'draft',
  review_date    date,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_hse_ra_tenant  on public.aura_hse_risk_assessments (tenant_id);
create index if not exists idx_hse_ra_project on public.aura_hse_risk_assessments (project_id);

alter table public.aura_hse_risk_assessments enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'aura_hse_risk_assessments' and policyname = 'tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_hse_risk_assessments
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;
