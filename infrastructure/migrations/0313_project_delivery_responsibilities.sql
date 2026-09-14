-- Project membership answers who may access a project. This register answers who owns a concrete
-- delivery handoff, by when, and whether they accepted and completed it. Keeping the two separate
-- prevents membership from becoming implicit functional authority.

create table if not exists public.aura_projects_responsibilities (
  id uuid primary key,
  tenant_id text not null,
  project_id uuid not null references public.aura_projects_projects(id),
  workstream text not null check (workstream in (
    'project_management','engineering_release','planning','procurement','site_execution',
    'commercial','quality','hse','commissioning','handover'
  )),
  title text not null,
  description text,
  assignee_id text not null,
  assigned_by text not null,
  due_date date,
  status text not null check (status in ('assigned','accepted','in_progress','completed')),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists idx_aura_projects_responsibilities_project
  on public.aura_projects_responsibilities (tenant_id, project_id, status, due_date);
create index if not exists idx_aura_projects_responsibilities_assignee
  on public.aura_projects_responsibilities (tenant_id, assignee_id, status, due_date);

alter table public.aura_projects_responsibilities enable row level security;
alter table public.aura_projects_responsibilities force row level security;
drop policy if exists hierarchical_isolation_policy on public.aura_projects_responsibilities;
create policy hierarchical_isolation_policy on public.aura_projects_responsibilities
  for all using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.aura_projects_projects p
      where p.id = project_id
        and (public.current_project_id() is null or p.id = public.current_project_id()::uuid)
        and (public.current_company_id() is null or p.company_id = public.current_company_id())
    )
  );

grant select, insert, update, delete on public.aura_projects_responsibilities to aura_app;

-- Existing databases retain persisted role rows, so the source catalog change alone cannot give
-- an assigned delivery user the functional permission to progress their own responsibility.
update public.aura_access_roles
set permissions = permissions || '["projects.responsibility.update"]'::jsonb,
    updated_at = now()
where id in (
  'r-technical-engineer','r-site-engineer','r-planning-engineer','r-project-engineer',
  'r-technical-manager','r-commercial-manager','r-procurement','r-store','r-qa-qc','r-hse',
  'r-commissioning-engineer','r-handover-fm'
)
and not permissions ? 'projects.responsibility.update';

-- @DOWN
update public.aura_access_roles
set permissions = permissions - 'projects.responsibility.update', updated_at = now()
where id in (
  'r-technical-engineer','r-site-engineer','r-planning-engineer','r-project-engineer',
  'r-technical-manager','r-commercial-manager','r-procurement','r-store','r-qa-qc','r-hse',
  'r-commissioning-engineer','r-handover-fm'
);
drop table if exists public.aura_projects_responsibilities;
