-- ============================================================
-- AURA OS — migration 0287: §22 Step 5 — task resource requirements
-- ------------------------------------------------------------
-- DEMAND, and only demand. A requirement says what a task needs; whether that capacity exists is a
-- separate question with a separate answer, and whether anyone has COMMITTED it is a third
-- (Step 6, bookings). The gate's rule is that these never collapse:
--
--     Demand  ≠  Capacity  ≠  Booking  ≠  Actual
--
-- Several per task, mandatory rather than optional (DG-22.1). "4 ELV technicians AND 2 riggers AND
-- crane CR-01" is one task, and the old single `resource?: string` could not say it.
--
-- A requirement is stored as a typed ResourceRef — two columns, never one composite string —
-- because the cross-project conflict check is reference EQUALITY, and because two columns are what
-- let the database index and constrain it.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_projects_task_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  project_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  task_id uuid NOT NULL,
  resource_type text NOT NULL,             -- employee | vehicle | asset | pool
  canonical_resource_id text NOT NULL,
  unit text NOT NULL,
  quantity numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,

  CONSTRAINT aura_projects_task_requirements_type_check
    CHECK (resource_type IN ('employee', 'vehicle', 'asset', 'pool')),
  CONSTRAINT aura_projects_task_requirements_unit_check
    CHECK (unit IN ('hours', 'persons', 'crews', 'units')),
  -- Zero demand is not a requirement, it is the absence of one. A zero row would put a line on the
  -- screen claiming a task needs something it does not, and would be counted by every rollup.
  CONSTRAINT aura_projects_task_requirements_quantity_check
    CHECK (quantity > 0),

  -- One requirement per resource per task. Two lines for the same crane are one requirement
  -- recorded twice, and the planner would count both — inflating demand against a capacity that
  -- never changed.
  CONSTRAINT uq_aura_projects_task_requirements_resource
    UNIQUE (task_id, resource_type, canonical_resource_id),

  -- COMPOSITE LINEAGE. The requirement's task must belong to the same tenant, project and schedule
  -- as the requirement itself, so demand cannot be attached to another project's task even by a
  -- writer that tries. Same anchor Step 2A declared and Step 2B's dependencies use.
  CONSTRAINT aura_projects_task_requirements_task_fkey
    FOREIGN KEY (tenant_id, project_id, schedule_id, task_id)
    REFERENCES public.aura_projects_schedule_tasks (tenant_id, project_id, schedule_id, id)
    ON DELETE CASCADE
);

-- Deliberately NO foreign key from (resource_type, canonical_resource_id) to anything. An employee
-- lives in HR, a vehicle in Fleet, an asset in Assets — a database-level reference across those
-- boundaries would couple four modules' migrations, the same reasoning as §21's issue references.
-- Only `pool` has a table in this schema, and constraining one of four types would be a rule that
-- looks general and is not.
--
-- The consequence is stated rather than hidden: a requirement can name a resource that has been
-- deleted. It resolves to `found: false` and is reported, never silently dropped.

CREATE INDEX IF NOT EXISTS idx_aura_projects_task_requirements_task
  ON public.aura_projects_task_requirements (tenant_id, task_id);
-- The read the cross-project conflict check makes: everyone who wants THIS resource.
CREATE INDEX IF NOT EXISTS idx_aura_projects_task_requirements_resource
  ON public.aura_projects_task_requirements (tenant_id, resource_type, canonical_resource_id);

ALTER TABLE public.aura_projects_task_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_task_requirements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_task_requirements;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_task_requirements
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.aura_projects_projects p
      WHERE p.id = project_id
        AND (public.current_project_id() IS NULL OR p.id = public.current_project_id()::uuid)
        AND (public.current_branch_id() IS NULL OR p.branch_id = public.current_branch_id())
        AND (public.current_company_id() IS NULL OR p.company_id = public.current_company_id())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_task_requirements TO aura_app;

-- @DOWN
-- Dropping this discards every task's authored demand. There is nowhere else it exists: a
-- requirement is authored input, not something derivable from dates or from capacity.
DROP TABLE IF EXISTS public.aura_projects_task_requirements;
