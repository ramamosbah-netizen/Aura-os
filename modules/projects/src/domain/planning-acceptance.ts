import type { Id } from '@aura/shared';
import type { ProjectSchedule } from './schedule';
import type { PlanningRun } from './planning-run';

/**
 * §22 Step 10 — governed acceptance (Design Gate DG-22.4).
 *
 * This is the ONLY place a proposal's dates become the current plan. A run produced a proposal and
 * changed nothing (Step 9); acceptance is the separate, explicit, recorded act that promotes it:
 *
 *   Solver Proposal  →  [acceptProposal]  →  Current Plan
 *
 * It is governed the way a booking is (DG-22.8: governed, not blocked). Two refusals are STRUCTURAL —
 * there is no honest way to proceed — and one is a GOVERNANCE cost:
 *
 *   structural   a proposal whose run is not `proposed` — already accepted, superseded or discarded.
 *   structural   a proposal that leaves any task unplaceable — there are no dates to make current,
 *                and a stale proposal that no longer matches the schedule's tasks.
 *   governed     accepting a NOT-established plan (a known conflict, or something unjudged) is
 *                permitted but costs an acknowledgement — the same shape as a booking's
 *                over-capacity reason. Blocking would prevent the record, not the reality.
 *
 * Acceptance touches `plannedStart`/`plannedEnd` and NOTHING else: baseline and actuals are left
 * exactly as they were. The baseline is separately governed (`setBaseline`), and a run that quietly
 * moved it would collapse the very distinction the chain exists to keep.
 */

export interface AcceptanceDecision {
  acceptedBy?: Id | null;
  /** Required when the proposal is not `established`. Ignored (recorded as null) when it is. */
  acknowledgeReason?: string | null;
}

export interface AcceptedPlan {
  /** The schedule with its current dates promoted to the proposal's. A NEW object; the input is untouched. */
  schedule: ProjectSchedule;
  /** The run, now `accepted`, carrying who/when and any acknowledgement. */
  run: PlanningRun;
}

/**
 * Promote a proposal to the current plan.
 *
 * Pure and non-mutating: returns a new schedule and a new run; the inputs are unchanged. Whether the
 * plan is `established` is read from the run's own proposal — the verdict the run recorded — so
 * acceptance judges exactly what was shown, not a re-derivation that today's facts might have moved.
 */
export function acceptProposal(
  schedule: ProjectSchedule,
  run: PlanningRun,
  decision: AcceptanceDecision = {},
): AcceptedPlan {
  if (run.status !== 'proposed') {
    throw new Error(`only a proposed run can be accepted; this run is ${run.status}`);
  }
  if (run.scheduleId !== schedule.id) {
    // Accepting one schedule's proposal onto another would write dates computed for other tasks.
    throw new Error('this proposal belongs to a different schedule');
  }

  const placements = new Map(run.proposal.placements.map((p) => [p.taskId, p]));

  // Stale-proposal guard: the proposal must describe exactly this schedule's tasks. A task added or
  // removed since the run means the proposal is out of date, and promoting it would carry stale dates
  // or drop a task silently.
  const scheduleIds = new Set(schedule.tasks.map((t) => t.id));
  const proposalIds = new Set(placements.keys());
  const sameTasks =
    scheduleIds.size === proposalIds.size && [...scheduleIds].every((id) => proposalIds.has(id));
  if (!sameTasks) {
    throw new Error('the schedule has changed since this proposal was produced; re-run before accepting');
  }

  // Structural: a task the solver could not place has no dates to make current.
  const unplaceable = schedule.tasks.filter((t) => placements.get(t.id)?.scheduled !== true);
  if (unplaceable.length > 0) {
    throw new Error(
      `cannot accept a plan that leaves ${unplaceable.length} task(s) unplaceable; author their durations and re-run`,
    );
  }

  // Governed: a plan that is not established may be accepted, but the acknowledgement is required.
  const reason = decision.acknowledgeReason?.trim() || null;
  if (!run.proposal.established && !reason) {
    throw new Error(
      'this proposal is not established (a known conflict, or something unjudged); accepting it anyway requires an acknowledgement',
    );
  }

  const now = new Date().toISOString();
  const tasks = schedule.tasks.map((t) => {
    const p = placements.get(t.id)!;
    // Only the current plan moves. Baseline and actuals are deliberately left as they were.
    return { ...t, plannedStart: p.start as string, plannedEnd: p.end as string };
  });

  return {
    schedule: { ...schedule, tasks, updatedAt: now },
    run: {
      ...run,
      status: 'accepted',
      acceptedAt: now,
      acceptedBy: decision.acceptedBy ?? null,
      // Recorded only where it means something: an acknowledgement on an established plan would read,
      // later, as evidence of an overrun that never happened.
      acceptanceReason: run.proposal.established ? null : reason,
    },
  };
}

/**
 * Mark every OTHER outstanding proposal for the accepted run's schedule as `superseded`.
 *
 * Acceptance chooses one proposal; the rest are no longer candidates. This is separated from
 * `acceptProposal` because it is a fact about the SET of runs — which the store holds — not about the
 * one being accepted. `accepted`, `discarded` and other schedules' runs are left as they are.
 */
export function supersedeProposals(
  runs: readonly PlanningRun[],
  acceptedRun: Pick<PlanningRun, 'id' | 'scheduleId'>,
): PlanningRun[] {
  return runs.map((r) =>
    r.id !== acceptedRun.id && r.scheduleId === acceptedRun.scheduleId && r.status === 'proposed'
      ? { ...r, status: 'superseded' as const }
      : r,
  );
}

/** Reject a proposal outright. A discarded proposal can never be accepted; the reason is required. */
export function discardProposal(run: PlanningRun, input: { reason: string }): PlanningRun {
  if (run.status !== 'proposed') {
    throw new Error(`only a proposed run can be discarded; this run is ${run.status}`);
  }
  if (!input.reason?.trim()) {
    // A discard with no reason is indistinguishable from a mistake — and a re-run will make another.
    throw new Error('discarding a proposal requires a reason');
  }
  return { ...run, status: 'discarded', discardedReason: input.reason.trim() };
}
