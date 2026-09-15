-- AURA OS — connect a held resource commitment to the exact authored activity demand it satisfies.

ALTER TABLE public.aura_projects_resource_bookings
  ADD COLUMN IF NOT EXISTS requirement_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_aura_projects_task_requirements_lineage
  ON public.aura_projects_task_requirements (tenant_id, project_id, schedule_id, task_id, id);

ALTER TABLE public.aura_projects_resource_bookings
  DROP CONSTRAINT IF EXISTS aura_projects_resource_bookings_requirement_fkey;
ALTER TABLE public.aura_projects_resource_bookings
  ADD CONSTRAINT aura_projects_resource_bookings_requirement_fkey
    FOREIGN KEY (tenant_id, project_id, schedule_id, task_id, requirement_id)
    REFERENCES public.aura_projects_task_requirements (tenant_id, project_id, schedule_id, task_id, id)
    ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_aura_projects_resource_bookings_held_requirement
  ON public.aura_projects_resource_bookings (tenant_id, project_id, requirement_id)
  WHERE status = 'held' AND requirement_id IS NOT NULL;

-- @DOWN
ALTER TABLE public.aura_projects_resource_bookings
  DROP CONSTRAINT IF EXISTS aura_projects_resource_bookings_requirement_fkey;
DROP INDEX IF EXISTS public.uq_aura_projects_resource_bookings_held_requirement;
DROP INDEX IF EXISTS public.uq_aura_projects_task_requirements_lineage;
ALTER TABLE public.aura_projects_resource_bookings
  DROP COLUMN IF EXISTS requirement_id;
