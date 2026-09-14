-- A delivery responsibility can receive one canonical engineering release. The drawing and
-- transmittal remain owned by Engineering and DocControl; this row stores only their immutable
-- identity so the assignee can reach the governed source from My Work without duplicated truth.

alter table public.aura_projects_responsibilities
  add column if not exists source_type text check (source_type is null or source_type = 'engineering.drawing'),
  add column if not exists source_id uuid,
  add column if not exists source_reference text,
  add column if not exists source_revision text,
  add column if not exists transmittal_ref text,
  add column if not exists linked_at timestamptz;

-- One issued drawing may have several named internal recipients. Each responsibility is protected
-- by the service from being rebound to another source; this index supports source-side lookup.
create index if not exists ix_aura_project_responsibility_engineering_source
  on public.aura_projects_responsibilities (tenant_id, source_type, source_id)
  where source_id is not null;

-- @DOWN
drop index if exists public.ix_aura_project_responsibility_engineering_source;
alter table public.aura_projects_responsibilities
  drop column if exists linked_at,
  drop column if exists transmittal_ref,
  drop column if exists source_revision,
  drop column if exists source_reference,
  drop column if exists source_id,
  drop column if exists source_type;
