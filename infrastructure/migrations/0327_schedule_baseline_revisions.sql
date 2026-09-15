-- ============================================================
-- AURA OS — migration 0327: a baseline is an act somebody performed, and re-baselining destroys
-- evidence unless the old one is kept.
-- ------------------------------------------------------------
-- A baseline is what performance is measured against. Every variance figure on a project — a
-- delay's impact, a recovery's worth, an SPI — is a comparison to it, which makes it the single
-- most consequential thing on a programme to overwrite.
--
-- It was overwritten silently. `setBaseline` copied today's planned dates onto every task, stamped
-- `baseline_set_at`, and that was all: no record of WHO, no reason, and the previous baseline gone.
-- Accept a recovery, re-baseline, and every delay ever assessed against the old dates is now
-- measured against the new ones — the variance the recovery existed to answer for, erased by the
-- act of answering for it, with nothing on any screen saying it happened.
--
-- So: a baselining act is a ROW. Each carries its revision number, when it was taken, WHO took it,
-- why (required from the second one onwards — the first baseline needs no justification, replacing
-- one does), and the task dates it froze. Superseding a baseline therefore adds a revision rather
-- than destroying one, and a variance computed against revision 0 stays computable after revision 1
-- exists.
--
-- THE SNAPSHOT IS BY VALUE, deliberately. A baseline that referenced the live tasks would move with
-- them, which is the one thing a baseline must never do; and an activity deleted from the plan must
-- not delete the record of what it was once committed to deliver.
--
-- `baseline_set_by` and `baseline_revision` also land on the schedule itself, so the current
-- baseline can be read without joining — the plan screen asks "which baseline am I looking at" on
-- every render.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_projects_schedule_baselines (
  id           uuid PRIMARY KEY,
  tenant_id    text NOT NULL,
  project_id   text NOT NULL,
  schedule_id  uuid NOT NULL,
  -- 0 is the original. A project's first baseline needs no justification; every later one does.
  revision     integer NOT NULL,
  set_at       timestamptz NOT NULL DEFAULT now(),
  set_by       text,
  reason       text,
  /** The dates frozen by this act, by value: [{ taskId, name, start, end }]. */
  tasks        jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT aura_projects_schedule_baselines_revision UNIQUE (schedule_id, revision),
  -- Replacing a baseline costs a sentence. Taking the first one does not.
  CONSTRAINT aura_projects_schedule_baselines_reason CHECK (
    revision = 0 OR (reason IS NOT NULL AND length(btrim(reason)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_schedule_baselines_schedule
  ON public.aura_projects_schedule_baselines (tenant_id, schedule_id, revision DESC);

-- ENABLE and FORCE, because FORCE is what binds a non-superuser owner; without it an
-- owner-connected proof passes vacuously.
ALTER TABLE public.aura_projects_schedule_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_schedule_baselines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_projects_schedule_baselines;
CREATE POLICY tenant_isolation_policy ON public.aura_projects_schedule_baselines
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT ON public.aura_projects_schedule_baselines TO aura_app;

-- Who took the current baseline, and which revision it is. Readable without a join, because the
-- plan screen asks on every render.
ALTER TABLE public.aura_projects_schedules
  ADD COLUMN IF NOT EXISTS baseline_set_by text,
  ADD COLUMN IF NOT EXISTS baseline_revision integer;

-- @DOWN
ALTER TABLE public.aura_projects_schedules
  DROP COLUMN IF EXISTS baseline_revision,
  DROP COLUMN IF EXISTS baseline_set_by;
DROP TABLE IF EXISTS public.aura_projects_schedule_baselines;
