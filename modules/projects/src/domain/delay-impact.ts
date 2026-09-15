import type { Id } from '@aura/shared';
import { planSchedule, type PlanInput, type PlanTaskInput } from './schedule-planning';

/**
 * §22 — what a delay actually did to the completion date.
 *
 * An EOT claim is a contractual instrument, and the number in it is the single most disputed figure
 * on a construction project. Two facts are routinely mistaken for each other, and the whole value
 * of this file is refusing to:
 *
 *   CLAIMED   how many days the event lasted. Authored by whoever recorded it, and a fact about
 *             the WORLD — the storm blew for ten days.
 *   IMPACT    how many working days the project's completion actually moved. DERIVED from the
 *             network, and a fact about the PLAN — a ten-day storm on an activity with six days of
 *             float moves completion by four, not ten.
 *
 * A contractor claims the first. An employer grants the second. A system that reports only one of
 * them has taken a side, and one that reports the first as if it were the second is simply wrong.
 *
 * The method is IMPACTED AS-PLANNED, and deliberately so: the same CPM that produces the programme
 * is run twice — once as planned, once with the delay inserted — and the completion dates are
 * diffed. Writing a second, bespoke delay calculator would give the project two answers to "when
 * does this finish", and the one nobody looks at would be the one in the claim.
 *
 * WORKING DAYS, under the project's calendar (PLN-03). A delay figure counted in calendar days is
 * indefensible the moment the contract counts working days, and a storm over a weekend the crew
 * was never going to work delayed nothing.
 *
 * CONCURRENCY IS NAMED, NEVER APPORTIONED. Where another delay overlaps this one, it is reported
 * with its cause and left there. Whether a contractor-caused delay running alongside an
 * employer-caused one reduces the employer's liability is a question of the contract and the law,
 * decided by people; a system that quietly halved a figure on that basis would be inventing a legal
 * position and hiding it inside arithmetic.
 */

export type DelayVerdict = 'IMPACT' | 'ABSORBED_BY_FLOAT' | 'UNKNOWN';

export interface DelayedActivity {
  taskId: Id;
  name: string;
  /** Finish as planned. */
  finishesAsPlanned: string | null;
  /** Finish once the delay is inserted. */
  finishesWithDelay: string | null;
}

export interface ConcurrentDelay {
  id: Id;
  title: string;
  causeCategory: string;
  startDate: string;
  endDate: string | null;
}

export interface DelayImpact {
  /** What the event says it lasted, as authored. */
  claimedDays: number;
  /** Completion as planned, from the network itself. */
  completionAsPlanned: string | null;
  /** Completion with the delay inserted. */
  completionWithDelay: string | null;
  /** WORKING days the completion date actually moved. Often fewer than claimed. */
  impactWorkingDays: number | null;
  /** Was an affected activity on the path that drives completion? */
  onCriticalPath: boolean;
  /** The activities the delay was recorded against, and what it does to each. */
  affected: DelayedActivity[];
  /** Other delay events overlapping this one — named, and deliberately not apportioned. */
  concurrent: ConcurrentDelay[];
  verdict: DelayVerdict;
  unknownReason: string | null;
}

export interface DelayImpactInput {
  /** The delay as recorded. */
  delay: { id: Id; claimedDays: number; startDate: string; endDate: string | null; affectedTaskIds: Id[] };
  /** The programme, as the planner would run it. */
  tasks: PlanTaskInput[];
  dependencies: Array<{ predecessorTaskId: Id; successorTaskId: Id }>;
  projectStart: string;
  /** Non-working dates from the project's calendar, exactly as a planning run takes them. */
  nonWorkingDays?: readonly string[];
  /** Every other delay event on this project, for the concurrency report. */
  otherDelays: ConcurrentDelay[];
}

const UNKNOWN = (unknownReason: string, over: Partial<DelayImpact> = {}): DelayImpact => ({
  claimedDays: 0, completionAsPlanned: null, completionWithDelay: null, impactWorkingDays: null,
  onCriticalPath: false, affected: [], concurrent: [], verdict: 'UNKNOWN', unknownReason, ...over,
});

/** Do two inclusive date ranges share a day? An open-ended delay is treated as still running. */
const overlaps = (aFrom: string, aTo: string | null, bFrom: string, bTo: string | null): boolean =>
  (aTo === null || bFrom <= aTo) && (bTo === null || aFrom <= bTo);

/**
 * Assess what a delay did to the programme.
 *
 * PURE. It runs the planner twice over data it was handed, and every edge that matters is reachable
 * in a test: an activity with float, an activity on the critical path, an event naming an activity
 * that is no longer in the plan, and an event nobody can place because the plan itself cannot be.
 */
export function assessDelayImpact(input: DelayImpactInput): DelayImpact {
  const { delay, tasks, dependencies, projectStart, nonWorkingDays, otherDelays } = input;
  const claimedDays = Math.max(0, Math.trunc(Number(delay.claimedDays) || 0));

  const concurrent = otherDelays.filter((other) =>
    other.id !== delay.id && overlaps(delay.startDate, delay.endDate, other.startDate, other.endDate));
  const known: Partial<DelayImpact> = { claimedDays, concurrent };

  const byId = new Map(tasks.map((task) => [task.id, task]));
  // An event naming an activity the plan no longer holds is not an instruction to invent one. It is
  // reported as naming nothing this plan can act on, which is what it is.
  const affectedTaskIds = delay.affectedTaskIds.filter((taskId) => byId.has(taskId));
  if (affectedTaskIds.length === 0) {
    return UNKNOWN('this delay names no activity that is still in the programme', known);
  }
  if (claimedDays === 0) {
    return UNKNOWN('this delay records no duration, so there is nothing to assess', known);
  }

  const withDependencies = (from: PlanTaskInput[]): PlanTaskInput[] => from.map((task) => ({
    ...task,
    dependencies: dependencies.filter((edge) => edge.successorTaskId === task.id).map((edge) => edge.predecessorTaskId),
  }));

  const asPlanned = planSchedule({ tasks: withDependencies(tasks), projectStart, nonWorkingDays } as PlanInput);
  // The delay inserted as extra WORK on each activity it hit: the same engine, the same calendar,
  // the same dependency network — so the two answers are comparable by construction.
  const delayed = planSchedule({
    tasks: withDependencies(tasks.map((task) => (affectedTaskIds.includes(task.id) && task.durationWorkingDays !== null
      ? { ...task, durationWorkingDays: task.durationWorkingDays + claimedDays }
      : task))),
    projectStart,
    nonWorkingDays,
  } as PlanInput);

  const placedIn = (plan: typeof asPlanned, taskId: Id) => plan.tasks.find((task) => task.id === taskId);
  const affected: DelayedActivity[] = affectedTaskIds.map((taskId) => ({
    taskId,
    name: byId.get(taskId)?.name ?? taskId,
    finishesAsPlanned: placedIn(asPlanned, taskId)?.end ?? null,
    finishesWithDelay: placedIn(delayed, taskId)?.end ?? null,
  }));
  const onCriticalPath = affectedTaskIds.some((taskId) => asPlanned.criticalPath.includes(taskId));
  const measured: Partial<DelayImpact> = { ...known, affected, onCriticalPath };

  // An activity with no authored duration cannot be placed, and the planner says so rather than
  // substituting one. A completion date derived from a plan that could not be built is not a
  // figure anybody should put in a claim.
  if (!asPlanned.established || !delayed.established) {
    return UNKNOWN('the programme cannot be placed, so no completion date can be compared', measured);
  }

  const completionAsPlanned = asPlanned.projectFinish;
  const completionWithDelay = delayed.projectFinish;
  // Both finishes come out of the same calendar-aware planner, so the difference between the two
  // durations IS the movement in working days — no second day-count, and no disagreement with it.
  const impactWorkingDays = Math.max(0, delayed.durationDays - asPlanned.durationDays);

  return {
    ...(measured as DelayImpact),
    completionAsPlanned,
    completionWithDelay,
    impactWorkingDays,
    // Absorbed by float is the commonest honest answer to an EOT claim, and it is a real verdict
    // rather than a failure to find one: the delay happened, and the completion date did not move.
    verdict: impactWorkingDays === 0 ? 'ABSORBED_BY_FLOAT' : 'IMPACT',
    unknownReason: null,
  };
}
