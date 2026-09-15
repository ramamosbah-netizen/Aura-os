-- ============================================================
-- AURA OS — migration 0325: a delay event names the activities it hit, and the assessment of it.
-- ------------------------------------------------------------
-- A delay event has carried `linked_activity_code` since it was introduced: a WBS code as TEXT.
-- That is the same non-canonical reference this programme has been correcting everywhere else — a
-- label that drifts the first time somebody renumbers a package, and a link no query can follow.
-- An EOT claim is a contractual instrument; "affected activity" being a string somebody typed is
-- not a basis for one.
--
-- So a delay names ACTIVITIES, canonically and many-to-one: a storm stops three activities, not a
-- code. The old column stays exactly where it is and is not migrated — nobody can reliably map a
-- free-text code onto an activity id after the fact, and guessing would manufacture the very
-- lineage this table exists to make real. It reads as what it always was: a note.
--
-- THE ASSESSMENT IS A RECORDED ACT; THE IMPACT IS DERIVED. Those are different facts and both are
-- kept. What a delay does to the completion date is computed from the network and the calendar on
-- every read, and it CHANGES as the programme changes — that is correct and is why it is not
-- stored. But an assessment submitted to an employer was made on a date, by a person, against the
-- plan as it then stood, and that figure must survive the plan moving underneath it. Storing only
-- the derived number would quietly rewrite history every time somebody edited an activity;
-- storing only the assessed one would hide that the plan has moved since. Both, side by side,
-- exactly as PLN-12 keeps a measurement beside the figure stated against it.
--
-- `assessed_impact_working_days` is WORKING days under the project's calendar (PLN-03). A
-- contractual delay figure counted in calendar days is indefensible the moment the contract counts
-- working days, and until migration 0324 the project had no calendar to count under.
--
-- No foreign key from the join table to the schedule task (ADR-0004 does not apply here — both are
-- Projects — but the reason is the same one migration 0316 gives): the task list is replaced
-- wholesale on every plan save, and a hard reference would either block a legitimate edit or
-- cascade a delay's evidence away with it. The link is checked at the service boundary and read
-- back defensively.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_projects_delay_activities (
  id                uuid PRIMARY KEY,
  tenant_id         text NOT NULL,
  project_id        text NOT NULL,
  delay_id          uuid NOT NULL REFERENCES public.aura_projects_delay_events (id) ON DELETE CASCADE,
  task_id           uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- One activity is named once per delay. Naming it twice is not a stronger claim.
  CONSTRAINT aura_projects_delay_activities_unique UNIQUE (delay_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_delay_activities_delay ON public.aura_projects_delay_activities (tenant_id, delay_id);
CREATE INDEX IF NOT EXISTS idx_delay_activities_task ON public.aura_projects_delay_activities (tenant_id, project_id, task_id);

-- ENABLE and FORCE, because FORCE is what binds a non-superuser owner; without it an
-- owner-connected proof passes vacuously.
ALTER TABLE public.aura_projects_delay_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_delay_activities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_projects_delay_activities;
CREATE POLICY tenant_isolation_policy ON public.aura_projects_delay_activities
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_delay_activities TO aura_app;

-- The recorded assessment: what a named person concluded, on a date, against the plan as it stood.
ALTER TABLE public.aura_projects_delay_events
  ADD COLUMN IF NOT EXISTS assessed_at timestamptz,
  ADD COLUMN IF NOT EXISTS assessed_by text,
  ADD COLUMN IF NOT EXISTS assessed_impact_working_days numeric(10,2),
  ADD COLUMN IF NOT EXISTS assessment_note text;

-- An assessment is a whole fact or none of it: a figure with nobody behind it is not an assessment,
-- and a name with no figure is not one either.
ALTER TABLE public.aura_projects_delay_events
  DROP CONSTRAINT IF EXISTS aura_projects_delay_events_assessment_complete;
ALTER TABLE public.aura_projects_delay_events
  ADD CONSTRAINT aura_projects_delay_events_assessment_complete CHECK (
    (assessed_at IS NULL AND assessed_by IS NULL AND assessed_impact_working_days IS NULL)
    OR (assessed_at IS NOT NULL AND assessed_by IS NOT NULL AND assessed_impact_working_days IS NOT NULL)
  );

-- Zero is a real assessment — "this delay was absorbed by float" is the commonest honest answer to
-- an EOT claim — but a negative one is not a figure anybody can defend.
ALTER TABLE public.aura_projects_delay_events
  DROP CONSTRAINT IF EXISTS aura_projects_delay_events_assessment_not_negative;
ALTER TABLE public.aura_projects_delay_events
  ADD CONSTRAINT aura_projects_delay_events_assessment_not_negative CHECK (
    assessed_impact_working_days IS NULL OR assessed_impact_working_days >= 0
  );

-- @DOWN
ALTER TABLE public.aura_projects_delay_events
  DROP CONSTRAINT IF EXISTS aura_projects_delay_events_assessment_not_negative;
ALTER TABLE public.aura_projects_delay_events
  DROP CONSTRAINT IF EXISTS aura_projects_delay_events_assessment_complete;
ALTER TABLE public.aura_projects_delay_events
  DROP COLUMN IF EXISTS assessment_note,
  DROP COLUMN IF EXISTS assessed_impact_working_days,
  DROP COLUMN IF EXISTS assessed_by,
  DROP COLUMN IF EXISTS assessed_at;
DROP TABLE IF EXISTS public.aura_projects_delay_activities;
