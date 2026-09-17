-- BUY-07 — operational ownership at the granularity of a WORK PACKAGE.
--
-- `BUY-07`'s generic acceptance proof requires a NEXT-ROLE RECEIPT, and the discovery for it found
-- that nothing in this system says who receives material for a given work package. Five candidate
-- relationships were examined and each misses on a different axis:
--
--   aura_projects_wbs_nodes          names nobody at all -- no owner, responsible or assignee
--   aura_projects_responsibilities   names a person, at PROJECT + workstream granularity
--   aura_projects_schedule_tasks     names a work package (0315) but carries no assignee
--   project membership               an access grant scoped to a PROJECT, never to a package
--   labour allocations (0323)        name a work package, but record a trade and headcount
--
-- Two get close and miss oppositely: a responsibility has the right person and the right lifecycle
-- at the wrong granularity; a schedule task has the right granularity and no person. So the missing
-- authority is added where operational ownership already lives, rather than forked into a new
-- concept. `aura_projects_responsibilities` is already described as "operational ownership inside a
-- project. Access grants remain in AccessService" -- it has the assignee, the
-- assigned -> accepted -> in_progress -> completed lifecycle, and a `site_execution` workstream.
-- What it lacked was granularity. This is that granularity, and nothing else.
--
-- NULLABLE, because a project-wide responsibility is still a legitimate and common thing: "you own
-- site execution on this job" is not the same statement as "you own the riser mains", and forcing
-- every responsibility onto a package would manufacture a precision nobody asserted. The same
-- reasoning migration 0323 applies to labour, and 0339 to a delivery destination.
--
-- NULL therefore does NOT make somebody the recipient of every package by default. A work package
-- with no responsibility scoped to it has NO RECIPIENT, which is an UNKNOWN the handoff refuses to
-- complete against -- it never falls back to the project-level assignee, and never to "whoever holds
-- the site engineer role". Falling back would be the same inference failure as resolving a
-- destination from a BOQ item, one layer up.

alter table public.aura_projects_responsibilities
  add column if not exists wbs_node_id uuid;

comment on column public.aura_projects_responsibilities.wbs_node_id is
  'Work package this responsibility is scoped to. NULL = project-wide, which does NOT make the assignee the recipient of any individual package.';

create index if not exists ix_aura_projects_responsibilities_wbs
  on public.aura_projects_responsibilities (tenant_id, project_id, wbs_node_id)
  where wbs_node_id is not null;

-- @DOWN
DROP INDEX IF EXISTS ix_aura_projects_responsibilities_wbs;
ALTER TABLE public.aura_projects_responsibilities DROP COLUMN IF EXISTS wbs_node_id;
