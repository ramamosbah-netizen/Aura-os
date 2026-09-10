import { type Id, newId } from '@aura/shared';
import type { ProjectSchedule } from './schedule';
import {
  type ExternalCommitment,
  type FeasibilityCoverage,
  type PlanFeasibility,
  type PlanInput,
  type PlanningDeficiency,
  type ResolvedCapacity,
  type ResourceVerdict,
  type SchedulePlan,
  type UnmetDemand,
  planSchedule,
} from './schedule-planning';

/**
 * §22 Step 9 — Planning Run and Solver Proposal (Design Gate DG-22.4).
 *
 * THE GOVERNED CHAIN, and the one rule that makes it a chain rather than a mutation:
 *
 *   Authored schedule → Planning Run → Solver Proposal → (governed acceptance) → Current Plan → Baseline
 *
 *   > A solver run must never mutate current or baseline dates merely because it executed.
 *
 * A computed result is not the plan's truth. It is a PROPOSAL — a set of dates the solver would
 * choose — and it stays a proposal until a person accepts it, which is Step 10 and a governed act of
 * its own. So `runPlanning` takes the authored schedule, runs the pure planner against RESOLVED facts
 * (the Step 7 resolver and Step 8 calendar supply them; this never queries), and returns a proposal
 * WITHOUT touching a single stored date. The schedule it was handed is unchanged, byte for byte.
 *
 * PROVENANCE. The schedule's `plannedStart`/`plannedEnd` are the CURRENT plan; `baselineStart`/`End`
 * the baseline. A proposal's dates are PROPOSED, and they live here, not on the task — which is what
 * keeps "the solver would move this" from being read as "this moved". `compareProposalToCurrent`
 * makes the difference legible, so acceptance is an informed decision rather than a leap.
 */

export type PlanningRunStatus = 'proposed' | 'accepted' | 'superseded' | 'discarded';

/** Where the solver would place one task. Provenance: proposed, never current. */
export interface ProposedTaskPlacement {
  taskId: Id;
  /** Null when the task could not be placed — reported, never guessed (matches the planner). */
  start: string | null;
  end: string | null;
  scheduled: boolean;
  critical: boolean;
}

/**
 * A single solver run's output. Self-describing: it carries the proposed placements AND the
 * feasibility picture the run produced, so a proposal can be saved, re-opened and compared without
 * re-running — and so acceptance sees the same verdict the run did.
 */
export interface SolverProposal {
  projectStart: string;
  projectFinish: string;
  durationDays: number;
  placements: ProposedTaskPlacement[];
  criticalPath: Id[];
  /** Whether anything that could be judged is in conflict. Says nothing about how much was judged. */
  feasibility: PlanFeasibility;
  /** PARTIAL when a resource could not be judged or a task could not be placed. Independent axis. */
  coverage: FeasibilityCoverage;
  /** The one combination a screen may present as "resourced": no conflict, nothing left unjudged. */
  established: boolean;
  resourceVerdicts: ResourceVerdict[];
  unmetDemand: UnmetDemand[];
  planningDeficiencies: PlanningDeficiency[];
}

/** An execution of the solver, and the proposal it produced. Persisted separately from the plan. */
export interface PlanningRun {
  id: Id;
  tenantId: Id;
  projectId: Id;
  scheduleId: Id;
  ranAt: string;
  ranBy: Id | null;
  /** A fresh run is `proposed`. Promotion (`accepted`) and retirement are Step 10's governed acts. */
  status: PlanningRunStatus;
  proposal: SolverProposal;

  // -- Acceptance provenance (Step 10): null until a governed act sets them ---
  /** When the proposal was promoted to the current plan. Null while `proposed`/`superseded`. */
  acceptedAt?: string | null;
  acceptedBy?: Id | null;
  /**
   * The acknowledgement recorded when a NOT-established proposal was accepted — a known conflict, or
   * a plan with something left unjudged. Governed, not blocked (DG-22.8): making such a plan current
   * is permitted, but it costs a sentence. Null when the accepted plan was established, or not yet
   * accepted.
   */
  acceptanceReason?: string | null;
  /** Why a proposal was discarded, when a planner rejects it outright. */
  discardedReason?: string | null;
}

/**
 * The facts a run is executed against, RESOLVED by the caller (Step 7 capacity/commitments, Step 8
 * calendar). The planner never queries; neither does this. `projectStart` defaults to the earliest
 * authored start when a project start is not supplied.
 */
export interface ResolvedPlanningFacts {
  projectStart?: string;
  capacities?: ResolvedCapacity[];
  externalCommitments?: ExternalCommitment[];
  nonWorkingDays?: readonly string[];
}

/** The finish-to-start predecessors of a task, read off the schedule's dependency network. */
const predecessorsOf = (schedule: ProjectSchedule, taskId: Id): Id[] =>
  schedule.dependencies.filter((d) => d.successorTaskId === taskId).map((d) => d.predecessorTaskId);

const earliestStart = (schedule: ProjectSchedule): string | null =>
  schedule.tasks.reduce<string | null>(
    (min, t) => (min === null || t.plannedStart < min ? t.plannedStart : min),
    null,
  );

/**
 * Translate the authored aggregate into the pure planner's input.
 *
 * PURE and non-mutating: every task and requirement is mapped to a fresh object, so the schedule
 * handed in is never touched. Dependencies come off the network by identity (successor → predecessor
 * ids), the same edges the database enforces.
 */
export function planInputFromSchedule(
  schedule: ProjectSchedule,
  facts: ResolvedPlanningFacts = {},
): PlanInput {
  const projectStart = facts.projectStart ?? earliestStart(schedule);
  if (!projectStart) {
    // An empty schedule has no earliest start to borrow, so a project start must be supplied.
    throw new Error('a planning run needs a project start: the schedule has no tasks to infer one from');
  }
  return {
    tasks: schedule.tasks.map((t) => ({
      id: t.id,
      name: t.name,
      durationWorkingDays: t.durationWorkingDays,
      dependencies: predecessorsOf(schedule, t.id),
      requirements: t.requirements.map((r) => ({ resource: r.resource, quantity: r.quantity, unit: r.unit })),
    })),
    projectStart,
    capacities: facts.capacities,
    externalCommitments: facts.externalCommitments,
    nonWorkingDays: facts.nonWorkingDays,
  };
}

const toProposal = (plan: SchedulePlan): SolverProposal => ({
  projectStart: plan.projectStart,
  projectFinish: plan.projectFinish,
  durationDays: plan.durationDays,
  placements: plan.tasks.map((t) => ({
    taskId: t.id, start: t.start, end: t.end, scheduled: t.scheduled, critical: t.critical,
  })),
  criticalPath: plan.criticalPath,
  feasibility: plan.feasibility,
  coverage: plan.coverage,
  established: plan.established,
  resourceVerdicts: plan.resourceVerdicts,
  unmetDemand: plan.unmetDemand,
  planningDeficiencies: plan.planningDeficiencies,
});

/**
 * Run the solver against an authored schedule and RESOLVED facts, and return a proposal.
 *
 * Does not touch the schedule. The result is `proposed`; nothing here promotes it. Running the same
 * schedule against the same facts yields the same proposal — the planner is deterministic (contract
 * #8) — so two runs differ only in `id` and `ranAt`, never in what they propose.
 */
export function runPlanning(
  schedule: ProjectSchedule,
  facts: ResolvedPlanningFacts = {},
  meta: { ranBy?: Id | null } = {},
): PlanningRun {
  const plan = planSchedule(planInputFromSchedule(schedule, facts));
  return {
    id: newId(),
    tenantId: schedule.tenantId,
    projectId: schedule.projectId,
    scheduleId: schedule.id,
    ranAt: new Date().toISOString(),
    ranBy: meta.ranBy ?? null,
    status: 'proposed',
    proposal: toProposal(plan),
  };
}

// ── Comparison: what accepting this proposal would change ───────────────────

export type TaskDateChangeKind =
  | 'UNCHANGED'
  | 'MOVED'
  | 'NEWLY_PLACED'
  | 'BECAME_UNPLACEABLE'
  | 'STILL_UNPLACEABLE';

export interface TaskDateChange {
  taskId: Id;
  name: string;
  currentStart: string | null;
  currentEnd: string | null;
  proposedStart: string | null;
  proposedEnd: string | null;
  change: TaskDateChangeKind;
}

export interface ProposalComparison {
  changes: TaskDateChange[];
  /** How many tasks the proposal would move (MOVED only). */
  movedCount: number;
  /** The current plan's finish (latest planned end), and where the proposal would put it. */
  currentFinish: string | null;
  proposedFinish: string;
}

const classify = (
  cur: { start: string | null; end: string | null },
  prop: { start: string | null; end: string | null },
): TaskDateChangeKind => {
  if (cur.start === null && prop.start === null) return 'STILL_UNPLACEABLE';
  if (cur.start !== null && prop.start === null) return 'BECAME_UNPLACEABLE';
  if (cur.start === null && prop.start !== null) return 'NEWLY_PLACED';
  return cur.start === prop.start && cur.end === prop.end ? 'UNCHANGED' : 'MOVED';
};

/**
 * Compare a proposal to the CURRENT plan, task by task.
 *
 * This is what makes acceptance a decision. A proposal that would move nothing is worth knowing;
 * a proposal that would push the finish out, or turn a placed task unplaceable, is worth knowing
 * before it becomes the plan, not after.
 */
export function compareProposalToCurrent(
  schedule: ProjectSchedule,
  proposal: SolverProposal,
): ProposalComparison {
  const byId = new Map(proposal.placements.map((p) => [p.taskId, p]));
  const changes: TaskDateChange[] = schedule.tasks
    .map((t) => {
      const p = byId.get(t.id) ?? { start: null, end: null };
      const cur = { start: t.plannedStart, end: t.plannedEnd };
      return {
        taskId: t.id,
        name: t.name,
        currentStart: t.plannedStart,
        currentEnd: t.plannedEnd,
        proposedStart: p.start,
        proposedEnd: p.end,
        change: classify(cur, p),
      };
    })
    .sort((a, b) => (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0));

  return {
    changes,
    movedCount: changes.filter((c) => c.change === 'MOVED').length,
    currentFinish: schedule.tasks.reduce<string | null>(
      (mx, t) => (mx === null || t.plannedEnd > mx ? t.plannedEnd : mx),
      null,
    ),
    proposedFinish: proposal.projectFinish,
  };
}
