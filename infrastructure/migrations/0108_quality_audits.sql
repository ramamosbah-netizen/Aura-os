-- ============================================================
-- AURA OS — migration 0108: Quality Audit Schedules & ISO Checklists Table
-- ------------------------------------------------------------
-- Namespaced under aura_quality_*. Apply with `pnpm db:migrate`.
-- ============================================================

create table if not exists public.aura_quality_audit_schedules (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  project_id      uuid        not null,
  project_name    text,
  audit_number    text        not null,
  audit_type      text        not null,
  scheduled_date  date        not null,
  auditor_name    text        not null,
  status          text        not null default 'scheduled', -- scheduled | in_progress | completed | cancelled
  checklist       jsonb       not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_aura_quality_audits_project on public.aura_quality_audit_schedules (tenant_id, project_id);

alter table public.aura_quality_audit_schedules enable row level security;

drop policy if exists tenant_isolation_policy on public.aura_quality_audit_schedules;

create policy tenant_isolation_policy on public.aura_quality_audit_schedules
for all
using (
  tenant_id = public.current_tenant_id()
  and (
    company_id is null 
    or public.current_company_id() is null 
    or company_id = public.current_company_id()
  )
);
