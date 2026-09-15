-- ============================================================
-- AURA OS — migration 0326: a recovery proposal knows what it is recovering from, and what it was
-- computed against.
-- ------------------------------------------------------------
-- A planning run has been a SCENARIO since Step 9: it is stored beside the plan, changes no stored
-- date, and becomes current only through a governed acceptance. That part was already right. Two
-- things were missing, and both matter most on the one run that gets submitted to an employer.
--
-- LINEAGE. A recovery proposal produced because of a delay had no link to that delay. It read as a
-- re-plan somebody happened to run, and the question an EOT file has to answer — "what is this
-- recovery FOR?" — could only be answered by whoever was in the room. `source_delay_id` and
-- `source_assessment_impact_days` make the hand-off from PLN-14 an explicit, recorded act: the
-- assessment that justified the re-plan travels with the proposal, frozen as it was at that moment,
-- so a later re-assessment does not rewrite what this proposal was prepared against.
--
-- BASIS FINGERPRINT. Acceptance already refused a proposal whose TASK SET had changed, which
-- catches an activity added or removed and nothing else. A programme can move underneath a proposal
-- without gaining or losing a single task: somebody extends a duration, moves a date, adds a
-- dependency, or points the project at a different working calendar. Accepting then writes dates
-- computed against a programme that no longer exists — silently, because every task id still
-- matches. The fingerprint is taken over everything the solver actually consumed (each task's
-- dates and authored duration, the dependency edges, and the calendar named by the project) and
-- compared at acceptance. Changed means re-run, not "accept and hope".
--
-- Both columns are nullable: an ordinary re-plan has no delay behind it and is not less legitimate
-- for that, and a run recorded before this migration has no fingerprint to compare — which reads as
-- "cannot be checked" and is stated rather than passed silently.
-- ============================================================

ALTER TABLE public.aura_projects_planning_runs
  ADD COLUMN IF NOT EXISTS source_delay_id uuid,
  ADD COLUMN IF NOT EXISTS source_assessment_impact_days numeric(10,2),
  ADD COLUMN IF NOT EXISTS basis_fingerprint text;

-- The read behind "what recovery has been proposed for this delay?" — one lookup per delay.
CREATE INDEX IF NOT EXISTS idx_planning_runs_source_delay
  ON public.aura_projects_planning_runs (tenant_id, source_delay_id)
  WHERE source_delay_id IS NOT NULL;

-- A proposal that names a delay carries the assessment it was prepared against. Half of that pair
-- is not a hand-off; it is a run with a note on it.
ALTER TABLE public.aura_projects_planning_runs
  DROP CONSTRAINT IF EXISTS aura_projects_planning_runs_recovery_lineage;
ALTER TABLE public.aura_projects_planning_runs
  ADD CONSTRAINT aura_projects_planning_runs_recovery_lineage CHECK (
    source_delay_id IS NULL OR source_assessment_impact_days IS NOT NULL
  );

-- @DOWN
ALTER TABLE public.aura_projects_planning_runs
  DROP CONSTRAINT IF EXISTS aura_projects_planning_runs_recovery_lineage;
DROP INDEX IF EXISTS public.idx_planning_runs_source_delay;
ALTER TABLE public.aura_projects_planning_runs
  DROP COLUMN IF EXISTS basis_fingerprint,
  DROP COLUMN IF EXISTS source_assessment_impact_days,
  DROP COLUMN IF EXISTS source_delay_id;
