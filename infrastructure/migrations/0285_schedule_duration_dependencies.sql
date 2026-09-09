-- ============================================================
-- AURA OS — migration 0285: §22 Step 2B — authored duration & first-class dependencies
-- ------------------------------------------------------------
-- Step 2A gave schedule tasks stable identity as rows. This adds the two authored planning facts
-- the planner needs and the stored schedule never had: how long a task takes, and what must finish
-- before it starts.
--
-- DURATION IS NULLABLE, AND THAT IS THE POINT. A legacy task has planned dates and nothing else.
-- Setting `duration_working_days = planned_end - planned_start` would convert a computed date range
-- into an authored planning input that nobody stated — the schedule would then claim someone had
-- decided a duration when all they did was drag a bar. NULL means "not authored yet", the planner
-- reports it as an explicit planning deficiency, and a person supplies it through the governed
-- writer. Fabricated precision is worse than an admitted gap.
--
-- Calendar days would also have been the wrong unit: the planner works in WORKING days, so
-- `planned_end - planned_start` includes weekends and holidays it never counted. The column name
-- says which unit it is, because `durationDays` did not.
--
-- DEPENDENCIES ARE ROWS, NOT AN ARRAY. A predecessor list inside the task would have no
-- referential integrity and no way to express the lineage constraint below.
--
-- NO TYPE COLUMN. The planner supports finish-to-start only, so the semantics are stated once here
-- rather than encoded as an enum with a single member: THE PREDECESSOR MUST FINISH BEFORE THE
-- SUCCESSOR STARTS. Inventing FS/SS/FF/SF now would be a vocabulary the engine cannot honour, and a
-- column every reader would have to be told to ignore. Lag is absent for the same reason.
-- ============================================================

ALTER TABLE public.aura_projects_schedule_tasks
  ADD COLUMN IF NOT EXISTS duration_working_days integer;

ALTER TABLE public.aura_projects_schedule_tasks
  DROP CONSTRAINT IF EXISTS aura_projects_schedule_tasks_duration_check;
ALTER TABLE public.aura_projects_schedule_tasks
  ADD CONSTRAINT aura_projects_schedule_tasks_duration_check
  CHECK (duration_working_days IS NULL OR duration_working_days > 0);

-- Deliberately NOT backfilled. Every existing task keeps NULL until someone authors a duration.

CREATE TABLE IF NOT EXISTS public.aura_projects_schedule_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  project_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  predecessor_task_id uuid NOT NULL,
  successor_task_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,

  -- A task cannot wait for itself. The cheapest cycle to make and the cheapest to refuse.
  CONSTRAINT aura_projects_schedule_dependencies_self_check
    CHECK (predecessor_task_id <> successor_task_id),

  -- One edge between any two tasks. A duplicate is not additional information.
  CONSTRAINT uq_aura_projects_schedule_dependencies_edge
    UNIQUE (schedule_id, predecessor_task_id, successor_task_id),

  -- COMPOSITE LINEAGE, both ends. Each endpoint must belong to the SAME tenant, project and
  -- schedule as the dependency row itself — so a dependency physically cannot join a task in
  -- project A to a task in project B, even if a writer tries. A pair of plain
  -- `FK task_id -> tasks(id)` constraints would permit exactly that. Same pattern as §21's
  -- risk→issue provenance and 0244's estimate lineage, and the reason 2A declared the composite
  -- UNIQUE it keys on.
  CONSTRAINT aura_projects_schedule_dependencies_predecessor_fkey
    FOREIGN KEY (tenant_id, project_id, schedule_id, predecessor_task_id)
    REFERENCES public.aura_projects_schedule_tasks (tenant_id, project_id, schedule_id, id)
    ON DELETE CASCADE,
  CONSTRAINT aura_projects_schedule_dependencies_successor_fkey
    FOREIGN KEY (tenant_id, project_id, schedule_id, successor_task_id)
    REFERENCES public.aura_projects_schedule_tasks (tenant_id, project_id, schedule_id, id)
    ON DELETE CASCADE
);

-- Cycles longer than one hop are a GRAPH invariant, not a row invariant. Enforcing them here would
-- need a recursive trigger on every insert — expensive, hard to reason about, and duplicating a
-- rule the domain already owns and tests. The governed writer rejects them; this table refuses only
-- what a single row can be judged on.

CREATE INDEX IF NOT EXISTS idx_aura_projects_schedule_dependencies_schedule
  ON public.aura_projects_schedule_dependencies (tenant_id, schedule_id);
CREATE INDEX IF NOT EXISTS idx_aura_projects_schedule_dependencies_successor
  ON public.aura_projects_schedule_dependencies (schedule_id, successor_task_id);

ALTER TABLE public.aura_projects_schedule_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_schedule_dependencies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_schedule_dependencies;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_schedule_dependencies
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_schedule_dependencies TO aura_app;

-- @DOWN
-- Dropping the dependency table discards the authored network. Durations authored since this
-- migration are lost with the column: there is nowhere else they exist, because 2A deliberately
-- did not infer them from dates and this migration deliberately did not backfill them.
DROP TABLE IF EXISTS public.aura_projects_schedule_dependencies;
ALTER TABLE IF EXISTS public.aura_projects_schedule_tasks
  DROP CONSTRAINT IF EXISTS aura_projects_schedule_tasks_duration_check;
ALTER TABLE IF EXISTS public.aura_projects_schedule_tasks
  DROP COLUMN IF EXISTS duration_working_days;
