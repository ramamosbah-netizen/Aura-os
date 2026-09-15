-- ============================================================
-- AURA OS — migration 0328: a milestone is a point where something must be TRUE, not a task that
-- takes no time.
-- ------------------------------------------------------------
-- There was no milestone in this system at all. No table, no route, no domain rule — and yet
-- Project 360 has been offering a link labelled "Add task or milestone" that opens a screen which
-- can only add a task. A label for a capability that does not exist is the same defect Wave 3
-- already removed from DocControl's "Dispatch & Send", and it is removed here the same way: by
-- building the thing the label promises.
--
-- A milestone is NOT modelled as a zero-duration activity, which is how most systems do it and is
-- wrong twice over here. The planner refuses a duration below one day — rightly, since an activity
-- that takes no time is not one — so a milestone would have to carry a fake day that inflates every
-- path it sits on. And a milestone is not work: nobody performs it. It is a statement about when
-- other work must be finished, so it lives in its own table and points AT the activities.
--
-- THE TARGET DATE IS AUTHORED AND IT DOES NOT MOVE. Deriving it from the gating activities would
-- make it recompute itself every time the plan is edited, and a milestone that recomputes its own
-- deadline can never be missed. The forecast moves; the commitment does not. Same discipline as the
-- baseline in 0327 and the forecast in PLN-16.
--
-- THE STATUS IS NOT STORED. There is no `status` column here, deliberately: ON_TRACK, AT_RISK,
-- MISSED and UNKNOWN are derived on every read from the gating work, because a stored verdict is
-- stale the moment an activity moves, and a milestone reading "on track" against a programme that
-- slipped last week is worse than having no milestone. Same rule the resource conflict follows.
--
-- THE ACHIEVEMENT IS AN ACT, not a boolean. Four columns that move together or not at all: the day
-- it was met (which is NOT the day it was typed — signed off on site on Friday and entered on
-- Monday was met on Friday), who recorded it, their note, and when the record was made. Recording
-- one against unfinished gating work is permitted — real milestones are accepted with snags by
-- people entitled to accept them — and the contradiction is then STATED on every read rather than
-- refused or hidden. That combination is the whole point: the commonest way a programme lies to
-- management is a green milestone over work at forty percent, with nothing anywhere saying both.
-- ============================================================

-- The lineage key a composite foreign key needs to point at. `id` alone is already the primary key,
-- so this adds no new uniqueness — it DECLARES the tuple, which is what lets a child table demand
-- that its tenant and project match the schedule's rather than merely naming one. Exactly the
-- constraint `uq_aura_projects_schedule_tasks_lineage` added to the tasks table for the same reason.
ALTER TABLE public.aura_projects_schedules
  DROP CONSTRAINT IF EXISTS uq_aura_projects_schedules_lineage;
ALTER TABLE public.aura_projects_schedules
  ADD CONSTRAINT uq_aura_projects_schedules_lineage UNIQUE (tenant_id, project_id, id);

CREATE TABLE IF NOT EXISTS public.aura_projects_milestones (
  id            uuid PRIMARY KEY,
  tenant_id     text NOT NULL,
  -- uuid, matching `aura_projects_schedules.project_id`: a composite foreign key demands the same
  -- type on both sides, and text here would make the constraint unimplementable.
  project_id    uuid NOT NULL,
  schedule_id   uuid NOT NULL,
  name          text NOT NULL,
  -- What was COMMITTED to. Authored, never derived, and it does not move when the plan moves.
  target_date   date NOT NULL,
  -- Who is answerable for it. Null until somebody is named; not a false zero.
  owner_id      text,
  -- The act. All four are present together or all four are absent — see the CHECK below.
  achieved_on   date,
  achieved_by   text,
  achieved_note text,
  achieved_at   timestamptz,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_projects_milestones_named CHECK (length(btrim(name)) > 0),
  -- One name per project. Two milestones called "Energisation" on one job are one milestone
  -- recorded twice, and every report downstream would have to guess which was meant.
  CONSTRAINT aura_projects_milestones_unique UNIQUE (tenant_id, project_id, name),
  -- An achievement is a whole fact or none of it: a date with nobody behind it is not a record of
  -- anything, and a name with no date cannot be measured against the commitment.
  CONSTRAINT aura_projects_milestones_achievement_complete CHECK (
    (achieved_on IS NULL AND achieved_at IS NULL)
    OR (achieved_on IS NOT NULL AND achieved_at IS NOT NULL)
  ),
  -- The schedule must be this project's. A milestone gating another project's programme is two
  -- projects wired together by accident.
  CONSTRAINT aura_projects_milestones_schedule_fk
    FOREIGN KEY (tenant_id, project_id, schedule_id)
    REFERENCES public.aura_projects_schedules (tenant_id, project_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_milestones_project
  ON public.aura_projects_milestones (tenant_id, project_id, target_date);
CREATE INDEX IF NOT EXISTS idx_projects_milestones_owner
  ON public.aura_projects_milestones (tenant_id, owner_id) WHERE owner_id IS NOT NULL;

-- ENABLE and FORCE, because FORCE is what binds a non-superuser owner; without it an
-- owner-connected proof passes vacuously.
ALTER TABLE public.aura_projects_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_milestones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_projects_milestones;
CREATE POLICY tenant_isolation_policy ON public.aura_projects_milestones
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_milestones TO aura_app;

-- ------------------------------------------------------------
-- What must finish for the milestone to be true.
--
-- The composite foreign key is what stops a milestone gating on an activity from another project's
-- programme — the database refuses it rather than trusting the caller to have checked.
--
-- ON DELETE CASCADE, chosen over RESTRICT after weighing both. RESTRICT would block a planner from
-- deleting any activity a milestone gates, which is the complaint already recorded against booking
-- lineage in PLN-10 and would make ordinary replanning painful enough to be worked around. CASCADE
-- drops the gate — and the milestone does NOT then quietly read "on track": with nothing gating it
-- the derived status is UNKNOWN, printed with the reason in words. Losing a gate is therefore loud
-- on the screen rather than silent, which is the property that actually matters.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aura_projects_milestone_gates (
  id           uuid PRIMARY KEY,
  tenant_id    text NOT NULL,
  project_id   uuid NOT NULL,
  schedule_id  uuid NOT NULL,
  milestone_id uuid NOT NULL REFERENCES public.aura_projects_milestones (id) ON DELETE CASCADE,
  task_id      uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- One activity gates a milestone once. Naming it twice is not a stronger claim, and every count
  -- downstream would read the same activity as two.
  CONSTRAINT aura_projects_milestone_gates_unique UNIQUE (milestone_id, task_id),
  CONSTRAINT aura_projects_milestone_gates_task_fk
    FOREIGN KEY (tenant_id, project_id, schedule_id, task_id)
    REFERENCES public.aura_projects_schedule_tasks (tenant_id, project_id, schedule_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_milestone_gates_milestone
  ON public.aura_projects_milestone_gates (tenant_id, milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_gates_task
  ON public.aura_projects_milestone_gates (tenant_id, project_id, task_id);

ALTER TABLE public.aura_projects_milestone_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_projects_milestone_gates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON public.aura_projects_milestone_gates;
CREATE POLICY tenant_isolation_policy ON public.aura_projects_milestone_gates
  FOR ALL
  USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_projects_milestone_gates TO aura_app;

-- The milestone a delivery responsibility was raised for, so the owner's My Work item can be traced
-- back to the thing it is about. `projects.milestone` joins `engineering.drawing` (0314) as a
-- recognised source of an operational responsibility.
COMMENT ON COLUMN public.aura_projects_responsibilities.source_type IS
  'Canonical origin of this responsibility: engineering.drawing, projects.milestone, or null when raised directly.';

-- @DOWN
DROP TABLE IF EXISTS public.aura_projects_milestone_gates;
DROP TABLE IF EXISTS public.aura_projects_milestones;
ALTER TABLE public.aura_projects_schedules
  DROP CONSTRAINT IF EXISTS uq_aura_projects_schedules_lineage;
