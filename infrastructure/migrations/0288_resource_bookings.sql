-- ============================================================
-- AURA OS — migration 0288: §22 Step 6 — resource bookings
-- ------------------------------------------------------------
-- A booking is a project's COMMITTED CLAIM on capacity. It is the third of the four facts the gate
-- insists never collapse into one another:
--
--     Demand  ≠  Capacity  ≠  Booking  ≠  Actual
--
-- THE TEMPORAL INVARIANT (Design Gate §1.1, normative):
--
--   > A booking is valid AT CREATION only if capacity was available at that time. A later
--   > availability change does not rewrite history and does not reject the owning domain's change;
--   > it changes the booking's CURRENT FEASIBILITY and creates a visible resource conflict
--   > requiring resolution.
--
-- Two properties, and the schema's most important decision is that only one of them is a column:
--
--     creation validity     settled once, at commitment, never revised   -> STORED
--     current feasibility   recomputed against today's availability      -> NOT A COLUMN
--
-- THERE IS DELIBERATELY NO `feasible`, `conflicted` OR `status='conflicted'` COLUMN HERE, and the
-- absence is the design rather than an omission. A stored verdict is a verdict as of the last time
-- somebody remembered to recompute it, and capacity changes for reasons that have nothing to do
-- with this project: an HR leave approval, a breakdown, another project's booking. Such a column
-- would be wrong the instant any of those happened, and wrong quietly. Feasibility is derived on
-- every read from `aura_projects_resource_capacity` and from every project's held bookings.
--
-- What IS stored is the snapshot of the judgement made at commitment — the tightest known capacity
-- across the booked days, and the total demand on that day — so that a booking which fitted
-- yesterday and does not fit today can say both things at once. A schema with one field for this
-- has to pick which truth to lose.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_projects_resource_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  -- Bookings ARE project-scoped, unlike pools and capacity (0286), because the commitment is made
  -- BY a project. The resource it claims belongs to the organisation; the claim belongs here.
  project_id uuid NOT NULL,

  -- The work this was committed for. An ADDRESS, not an integrity claim — see the note below on
  -- why these carry no foreign key.
  schedule_id uuid,
  task_id uuid,

  -- A ResourceRef, stored as its two parts. Never one composite string: two columns are what let
  -- the database index a reference, and reference EQUALITY is what every conflict verdict rests on.
  resource_type text NOT NULL,             -- employee | vehicle | asset | pool
  canonical_resource_id text NOT NULL,
  unit text NOT NULL,
  -- Held ON EACH DAY of the range, not a total spread across it. "4 electricians Monday to Friday"
  -- holds four on Monday and four on Friday. It is the only reading under which a day-by-day
  -- capacity comparison means anything.
  quantity numeric NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  status text NOT NULL DEFAULT 'held',     -- held | released

  -- ── The commitment snapshot: written once, never revised ────────────────
  -- NULL = committed against an UNKNOWN capacity. Permitted, and important to know later: "nobody
  -- had recorded the capacity" and "we knew, and it changed" are different conversations with
  -- different people. Not zero, which is a real and knowable fact, and not unlimited.
  capacity_at_commitment numeric,
  demand_at_commitment numeric NOT NULL,
  -- Why it was committed anyway when it demonstrably did not fit. This is what makes DG-22.8's
  -- "governed commitment, not hard lock" concrete at the storage layer.
  over_capacity_reason text,
  committed_at timestamptz NOT NULL DEFAULT now(),
  committed_by text,

  released_reason text,
  released_at timestamptz,
  released_by text,

  CONSTRAINT aura_projects_resource_bookings_type_check
    CHECK (resource_type IN ('employee', 'vehicle', 'asset', 'pool')),
  CONSTRAINT aura_projects_resource_bookings_unit_check
    CHECK (unit IN ('hours', 'persons', 'crews', 'units')),
  CONSTRAINT aura_projects_resource_bookings_status_check
    CHECK (status IN ('held', 'released')),
  -- Zero held is not a booking, it is the absence of one: counted by every rollup while committing
  -- nothing. The same false confidence a zero requirement carries.
  CONSTRAINT aura_projects_resource_bookings_quantity_check
    CHECK (quantity > 0),
  CONSTRAINT aura_projects_resource_bookings_interval_check
    CHECK (valid_to >= valid_from),
  -- The snapshot's demand is the total on the tightest day INCLUDING this booking, so it can never
  -- be less than what this booking itself holds. A row failing this was written by something that
  -- did not understand what the number means.
  CONSTRAINT aura_projects_resource_bookings_demand_check
    CHECK (demand_at_commitment >= quantity),

  -- GOVERNED, NOT BLOCKED. Committing over a KNOWN capacity is allowed — overtime gets approved,
  -- hires get arranged, and a planner who cannot record the commitment will simply not record it,
  -- which is the one outcome that helps nobody. But it may not happen SILENTLY, so it costs a
  -- sentence. Enforced here and not only in the domain, because a writer that bypasses the domain
  -- is exactly the writer whose silent overrun nobody would ever find.
  CONSTRAINT aura_projects_resource_bookings_over_capacity_check
    CHECK (
      capacity_at_commitment IS NULL
      OR demand_at_commitment <= capacity_at_commitment
      OR (over_capacity_reason IS NOT NULL AND btrim(over_capacity_reason) <> '')
    ),

  -- A release with no reason is indistinguishable from a mistake, and the capacity it frees will be
  -- re-committed by someone who cannot tell which it was. A held booking carries no release fields
  -- for the same reason §21 refuses a resolution note on an open issue.
  CONSTRAINT aura_projects_resource_bookings_release_check
    CHECK (
      (status = 'held'
        AND released_reason IS NULL AND released_at IS NULL AND released_by IS NULL)
      OR (status = 'released'
        AND released_reason IS NOT NULL AND btrim(released_reason) <> '' AND released_at IS NOT NULL)
    ),

  -- COMPOSITE LINEAGE. The project must belong to the same tenant as the booking, so a booking
  -- cannot be attached to another tenant's project even by a writer that tries. Keys on the
  -- tenant-qualified unique index established in 0273.
  CONSTRAINT aura_projects_resource_bookings_project_fkey
    FOREIGN KEY (tenant_id, project_id)
    REFERENCES public.aura_projects_projects (tenant_id, id)
);

-- ── Why `task_id` and `schedule_id` carry NO foreign key ───────────────────
--
-- Not for the §21 reason (a cross-module boundary): these tables are in this schema. The reason is
-- a property of how schedules are currently saved, and it is worth stating plainly rather than
-- leaving the missing constraint to look like carelessness.
--
-- `PostgresScheduleStore.writeTasks` performs `DELETE FROM aura_projects_schedule_tasks WHERE
-- schedule_id = $1` and re-inserts every task, by the same id, on each save. Task IDENTITY survives
-- (that was Step 2A's purpose) but the ROW's lifetime does not. Any foreign key from outside the
-- schedule aggregate would therefore either
--   * ON DELETE CASCADE  — destroy every commitment as a side effect of an unrelated plan edit, or
--   * ON DELETE RESTRICT — refuse every schedule save while any booking exists.
-- A DEFERRABLE constraint does not rescue this either: `writeTasks` executes on the pool rather
-- than inside a transaction, so the DELETE commits on its own.
--
-- That last detail is a defect in its own right and worse than the missing foreign key: because the
-- DELETE commits before the inserts run, a failure or a crash part way through a schedule save
-- leaves the schedule with NO TASKS, permanently. Recorded as AURA-PM-004, severity data-loss,
-- with its fix — upsert the surviving tasks instead of deleting them all, inside one transaction.
-- It belongs to Step 2A's store rather than to §22 Step 6, so it is recorded and left open here
-- rather than repaired sideways inside an unrelated step.
--
-- So a booking's task reference behaves exactly as every §22 resource reference already does: it is
-- an address that may stop resolving, and a booking whose task has been removed from the plan
-- reports `found: false` rather than disappearing. The commitment outlives the plan that motivated
-- it, which is also the honest domain answer — deleting a task does not un-commit a crane.

-- The read the cross-project capacity engine makes: who else wants THIS resource, in THIS window.
-- Partial, because a released booking holds nothing and must never appear in a conflict total.
CREATE INDEX IF NOT EXISTS idx_aura_projects_resource_bookings_resource
  ON public.aura_projects_resource_bookings (tenant_id, resource_type, canonical_resource_id, valid_from, valid_to)
  WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_aura_projects_resource_bookings_project
  ON public.aura_projects_resource_bookings (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_aura_projects_resource_bookings_task
  ON public.aura_projects_resource_bookings (tenant_id, task_id)
  WHERE task_id IS NOT NULL;

-- ── Row-level security ─────────────────────────────────────────────────────
-- Project-scoped, so the hierarchical policy applies — unlike pools and capacity, which have no
-- parent project to join and are correctly tenant-level. ENABLE and FORCE: FORCE is what binds a
-- non-superuser OWNER, and without it a proof run from an owning connection passes vacuously.

ALTER TABLE public.aura_projects_resource_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_resource_bookings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hierarchical_isolation_policy ON public.aura_projects_resource_bookings;
CREATE POLICY hierarchical_isolation_policy ON public.aura_projects_resource_bookings
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_resource_bookings TO aura_app;

-- @DOWN
-- Dropping this discards every commitment ever made and the record of what was known when each was
-- made. Neither is derivable: capacity says what exists, requirements say what is wanted, and only
-- a booking says what was actually promised to whom.
DROP TABLE IF EXISTS public.aura_projects_resource_bookings;
