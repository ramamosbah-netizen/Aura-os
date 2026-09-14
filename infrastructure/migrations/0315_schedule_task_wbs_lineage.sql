-- AURA OS — migration 0315: canonical WBS lineage for schedule activities
-- Existing activities remain nullable and are shown as legacy/unlinked. Every new activity is
-- required by the service to resolve through a persisted WBS node in the same tenant/project.

alter table public.aura_projects_schedule_tasks
  add column if not exists wbs_node_id uuid;

do $$ begin
  alter table public.aura_projects_schedule_tasks
    add constraint aura_projects_schedule_tasks_wbs_fk
    foreign key (tenant_id, project_id, wbs_node_id)
    references public.aura_projects_wbs_nodes (tenant_id, project_id, id)
    on delete restrict;
exception when duplicate_object then null;
end $$;

create index if not exists ix_aura_projects_schedule_tasks_wbs
  on public.aura_projects_schedule_tasks (tenant_id, project_id, wbs_node_id)
  where wbs_node_id is not null;

-- @DOWN
drop index if exists public.ix_aura_projects_schedule_tasks_wbs;
alter table public.aura_projects_schedule_tasks
  drop constraint if exists aura_projects_schedule_tasks_wbs_fk;
alter table public.aura_projects_schedule_tasks drop column if exists wbs_node_id;
