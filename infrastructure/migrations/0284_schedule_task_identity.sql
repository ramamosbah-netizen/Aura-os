-- ============================================================
-- AURA OS — migration 0284: §22 Step 2A — schedule task identity
-- ------------------------------------------------------------
-- Schedule tasks were embedded JSONB objects inside aura_projects_schedules.tasks with NO stable
-- identity. Their de facto identity was the NAME: `setScheduleTasks` rebuilt every task on save
-- and re-attached baselines through a Map keyed by name. Two consequences, both real:
--
--   * two tasks called "Install CCTV" were one key, so one silently took the other's baseline;
--   * renaming a task dropped its baseline entirely, because the old key no longer resolved.
--
-- The schedule forgot what it had committed to, and nothing reported it. Recorded as AURA-PM-003.
--
-- A uuid inside the JSON would fix the collision and still leave no relational integrity to hang
-- dependencies, requirements or bookings from — a foreign key cannot reference an element of a
-- JSONB array. So tasks become rows.
--
-- NON-DESTRUCTIVE BY DESIGN. This migration creates the table and backfills it. It does NOT drop
-- `aura_projects_schedules.tasks`: that column remains as a pre-cutover snapshot so a rollback has
-- somewhere to land, and is dropped by a later migration once the row model is proven in use. A
-- big-bang rewrite of a table we cannot inspect in every deployment is not a migration path, it is
-- a hope.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_projects_schedule_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES public.aura_projects_projects(id),
  schedule_id uuid NOT NULL REFERENCES public.aura_projects_schedules(id) ON DELETE CASCADE,
  -- Display and business data. MUTABLE, and never identity again.
  name text NOT NULL,
  planned_start date NOT NULL,
  planned_end date NOT NULL,
  baseline_start date,
  baseline_end date,
  actual_start date,
  actual_end date,
  percent_complete numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_projects_schedule_tasks_pct_check
    CHECK (percent_complete >= 0 AND percent_complete <= 100),
  CONSTRAINT aura_projects_schedule_tasks_dates_check
    CHECK (planned_end >= planned_start),
  -- The lineage anchor. Step 2B's dependency table will carry a composite foreign key onto
  -- (tenant_id, project_id, schedule_id, id), so the DATABASE refuses a dependency whose endpoints
  -- live in different projects or schedules — the pattern §21 uses for risk→issue provenance and
  -- 0244 for estimate lineage. Declaring it now means 2B adds a constraint rather than a table
  -- rewrite.
  CONSTRAINT uq_aura_projects_schedule_tasks_lineage UNIQUE (tenant_id, project_id, schedule_id, id)
);

-- Deliberately NO duration_working_days column. Duration is authored planning input and belongs to
-- Step 2B; inferring it here from planned_end − planned_start would turn a computed date range into
-- an authored fact nobody stated.

CREATE INDEX IF NOT EXISTS idx_aura_projects_schedule_tasks_schedule
  ON public.aura_projects_schedule_tasks (tenant_id, schedule_id);
CREATE INDEX IF NOT EXISTS idx_aura_projects_schedule_tasks_project
  ON public.aura_projects_schedule_tasks (tenant_id, project_id);

-- ── Backfill ───────────────────────────────────────────────────────────────
-- Every element of every existing tasks array becomes exactly one row, in array order, each with a
-- freshly minted uuid.
--
-- NO DEDUPLICATION. Two array elements named "Install CCTV" become two rows with two ids, because
-- they were two records that the old model handled badly. Preserve the data; repair the identity
-- semantics. Reinterpreting history to look tidier would discard a task somebody planned.
--
-- Fields are copied exactly, including nulls. `WITH ORDINALITY` is used only to keep the insert
-- order stable and reproducible; array position is not identity either.
INSERT INTO public.aura_projects_schedule_tasks
  (id, tenant_id, project_id, schedule_id, name, planned_start, planned_end,
   baseline_start, baseline_end, actual_start, actual_end, percent_complete, created_at, updated_at)
SELECT
  gen_random_uuid(),
  s.tenant_id,
  s.project_id,
  s.id,
  COALESCE(NULLIF(t.value->>'name', ''), 'Untitled task'),
  (t.value->>'plannedStart')::date,
  (t.value->>'plannedEnd')::date,
  NULLIF(t.value->>'baselineStart', '')::date,
  NULLIF(t.value->>'baselineEnd', '')::date,
  NULLIF(t.value->>'actualStart', '')::date,
  NULLIF(t.value->>'actualEnd', '')::date,
  COALESCE(NULLIF(t.value->>'percentComplete', '')::numeric, 0),
  s.created_at,
  s.updated_at
FROM public.aura_projects_schedules s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.tasks) = 'array' THEN s.tasks ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(value, ord)
-- A row missing planned dates cannot satisfy the NOT NULL columns. Such a task was already
-- unusable; skipping it is reported by the count check below rather than hidden by a fabricated
-- date.
WHERE t.value->>'plannedStart' IS NOT NULL
  AND t.value->>'plannedEnd' IS NOT NULL;

-- Prove the backfill was lossless, in the migration itself, so a partial copy cannot be committed.
DO $$
DECLARE
  src bigint;
  dst bigint;
  skipped bigint;
BEGIN
  SELECT COALESCE(SUM(jsonb_array_length(
           CASE WHEN jsonb_typeof(tasks) = 'array' THEN tasks ELSE '[]'::jsonb END)), 0)
    INTO src FROM public.aura_projects_schedules;
  SELECT COUNT(*) INTO dst FROM public.aura_projects_schedule_tasks;
  skipped := src - dst;
  IF skipped <> 0 THEN
    RAISE EXCEPTION
      'schedule task backfill is not lossless: % JSONB tasks, % rows (% skipped for missing planned dates)',
      src, dst, skipped;
  END IF;
  RAISE NOTICE 'schedule task backfill: % task(s) promoted to rows', dst;
END $$;

-- ── Row-level security ─────────────────────────────────────────────────────
-- ENABLE **and FORCE**, per the current standard. FORCE is what binds a non-superuser owner;
-- without it an isolation proof run from an owning connection passes vacuously.
--
-- The policy is the hierarchical one every aura_projects_* sub-table carries, reached through the
-- parent project. It is copied from the current approved shape, not from any historical weakness:
-- the branch narrowing is part of that shape today and is preserved here deliberately, with the
-- separate concern about it recorded as AURA-ORG-001 rather than quietly fixed in this migration.
ALTER TABLE public.aura_projects_schedule_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_schedule_tasks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_schedule_tasks;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_schedule_tasks
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_schedule_tasks TO aura_app;

-- @DOWN
-- Dropping the table discards the task identities minted by the backfill. That is recoverable only
-- because `aura_projects_schedules.tasks` was deliberately left in place: the pre-cutover snapshot
-- is still there, and reverting returns the system to name-based identity — defects included. Any
-- task created after cutover exists only as a row and is lost, which is the honest cost of
-- reverting an identity model.
DROP TABLE IF EXISTS public.aura_projects_schedule_tasks;
