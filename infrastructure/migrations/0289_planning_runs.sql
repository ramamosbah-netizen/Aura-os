-- ============================================================
-- AURA OS — migration 0289: §22 Step 9 — planning runs and solver proposals
-- ------------------------------------------------------------
-- The governed chain (DG-22.4), and the rule that makes it a chain rather than a mutation:
--
--   Authored schedule → Planning Run → Solver Proposal → (governed acceptance) → Current Plan → Baseline
--
--   > A solver run must never mutate current or baseline dates merely because it executed.
--
-- A run RECORDS what the solver would choose; it changes no schedule date. Acceptance (Step 10) is a
-- separate, governed act that promotes a proposal to the current plan. This table holds runs and the
-- proposals they produced, so a proposal can be saved, re-opened and compared without re-running.
--
-- WHY THE PROPOSAL IS ONE JSONB DOCUMENT, not shredded into rows. It is a COMPUTED snapshot — proposed
-- placements plus the verdict the run recorded (feasibility, coverage, established, resource verdicts,
-- unmet demand, deficiencies). It is read back whole, compared whole, and never queried field by
-- field; shredding it into relational tables would invent joins nothing traverses and let the parts
-- drift from the verdict they were computed together with. The schedule's own tasks remain the
-- relational authority; this is a record of a computation over them.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_projects_planning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  project_id uuid NOT NULL,
  schedule_id uuid NOT NULL,

  ran_at timestamptz NOT NULL DEFAULT now(),
  ran_by text,
  -- proposed → the run's default. accepted/superseded/discarded are Step 10's governed transitions.
  status text NOT NULL DEFAULT 'proposed',

  proposal jsonb NOT NULL,

  -- Acceptance provenance: null until a governed act sets it (Step 10).
  accepted_at timestamptz,
  accepted_by text,
  -- The acknowledgement recorded when a NOT-established proposal was accepted. Null for an established
  -- plan, or one not yet accepted.
  acceptance_reason text,
  -- Why a proposal was rejected outright.
  discarded_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aura_projects_planning_runs_status_check
    CHECK (status IN ('proposed', 'accepted', 'superseded', 'discarded')),

  -- Acceptance fields belong ONLY to an accepted run. A row with an acceptance reason but a
  -- 'proposed' status was written by something that did not understand the transition.
  CONSTRAINT aura_projects_planning_runs_accept_check
    CHECK (
      (status = 'accepted' AND accepted_at IS NOT NULL)
      OR (status <> 'accepted' AND accepted_at IS NULL AND accepted_by IS NULL AND acceptance_reason IS NULL)
    ),
  -- A discard reason belongs only to a discarded run, and a discard must carry one.
  CONSTRAINT aura_projects_planning_runs_discard_check
    CHECK (
      (status = 'discarded' AND discarded_reason IS NOT NULL AND btrim(discarded_reason) <> '')
      OR (status <> 'discarded' AND discarded_reason IS NULL)
    ),

  -- COMPOSITE LINEAGE: the project must belong to the same tenant as the run, so a run cannot be
  -- attached to another tenant's project even by a writer that tries. Keys on the tenant-qualified
  -- unique index (0273). The schedule reference is left without a foreign key for the same reason a
  -- booking's is (0288): the schedule aggregate's task rows are rewritten on save, and the run is a
  -- historical record that should outlive an edit to the plan it proposed against.
  CONSTRAINT aura_projects_planning_runs_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES public.aura_projects_projects (tenant_id, id)
);

-- The read the planning UI makes: this schedule's runs, newest first.
CREATE INDEX IF NOT EXISTS idx_aura_projects_planning_runs_schedule
  ON public.aura_projects_planning_runs (tenant_id, schedule_id, ran_at DESC);
-- Finding the outstanding proposals to supersede on acceptance.
CREATE INDEX IF NOT EXISTS idx_aura_projects_planning_runs_open
  ON public.aura_projects_planning_runs (tenant_id, schedule_id)
  WHERE status = 'proposed';

-- ── Row-level security ─────────────────────────────────────────────────────
-- Project-scoped, so the hierarchical policy applies. ENABLE and FORCE — FORCE binds a non-superuser
-- owner, without which a proof from an owning connection passes vacuously.

ALTER TABLE public.aura_projects_planning_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_planning_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_planning_runs;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_planning_runs
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_planning_runs TO aura_app;

-- @DOWN
-- Dropping this discards every recorded run and proposal. The current plan is unaffected — it lives
-- on the schedule's own task rows — but the history of what was proposed and what was accepted, and
-- with what acknowledgement, is gone.
DROP TABLE IF EXISTS public.aura_projects_planning_runs;
