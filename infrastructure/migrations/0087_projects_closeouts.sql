-- ============================================================
-- AURA OS — migration 0087: Project closeouts (handover workflow)
-- ------------------------------------------------------------
-- End-of-lifecycle handover: one closeout per project — a checklist
-- (JSONB) that must be fully cleared before finalizing, capturing the
-- handover date and the resulting DLP (defects-liability) end date.
-- ============================================================

create table if not exists public.aura_projects_closeouts (
  id            uuid        primary key default gen_random_uuid(),
  tenant_id     text        not null,
  company_id    text,
  project_id    uuid        not null,
  project_name  text,
  status        text        not null default 'in_progress' check (status in ('in_progress','completed')),
  items         jsonb       not null default '[]'::jsonb,
  handover_date date,
  dlp_end_date  date,
  notes         text        not null default '',
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, project_id)
);
create index if not exists idx_projects_closeouts_tenant on public.aura_projects_closeouts(tenant_id, status);

alter table public.aura_projects_closeouts enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_projects_closeouts;
create policy tenant_isolation_policy on public.aura_projects_closeouts
  for all using (tenant_id = public.current_tenant_id());
