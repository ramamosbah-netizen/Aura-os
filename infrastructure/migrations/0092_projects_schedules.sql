-- ============================================================
-- AURA OS — migration 0092: Project schedules (Gantt + baseline)
-- ------------------------------------------------------------
-- One schedule per project: tasks (JSONB) with planned/baseline/actual
-- dates + % complete. Baseline snapshots planned dates; summary yields
-- span, weighted % complete, and finish variance vs baseline.
-- ============================================================

create table if not exists public.aura_projects_schedules (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       text        not null,
  company_id      text,
  project_id      uuid        not null,
  project_name    text,
  tasks           jsonb       not null default '[]'::jsonb,
  baseline_set_at timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, project_id)
);
create index if not exists idx_projects_schedules_tenant on public.aura_projects_schedules(tenant_id);

alter table public.aura_projects_schedules enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_projects_schedules;
create policy tenant_isolation_policy on public.aura_projects_schedules
  for all using (tenant_id = public.current_tenant_id());
