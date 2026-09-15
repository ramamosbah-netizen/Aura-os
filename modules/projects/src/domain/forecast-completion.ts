import type { Id } from '@aura/shared';
import { planSchedule, type PlanTaskInput } from './schedule-planning';
import { signedWorkingDays, ALL_DAYS_WORKING, type WorkingCalendar } from './working-calendar';

/**
 * §22 — when this project will actually finish.
 *
 * Three dates, and a management report that confuses any two of them is worse than no report:
 *
 *   BASELINE   what was committed to. The yardstick (PLN-05), and the only one that does not move.
 *   PLANNED    what the programme says today. Moves whenever somebody edits it, and says nothing
 *              about whether the work is keeping up.
 *   FORECAST   where it lands if the work continues as it has been going. Derived from what has
 *              actually been INSTALLED, not from what the plan hopes.
 *
 * A "forecast" that repeats the planned finish is not a forecast; it is the plan with a new label,
 * and it is the single most common lie a project system tells. This one is different from the plan
 * exactly when the evidence says it should be: an activity half-built has half its duration left,
 * and if measurement says it is only a third built then it has more left than the plan allows.
 *
 * A FORECAST IS ONLY AS GOOD AS THE PROGRESS UNDER IT, and this says so out loud. PLN-12 already
 * separates a MEASURED percentage from a DECLARED one; a forecast resting on declarations is a
 * guess wearing a projection's clothes, so the confidence — how many of the driving activities
 * carry measured progress — travels with the date, always, and nothing about it is rounded up.
 *
 * Remaining duration is the whole mechanism: an activity that is 40% done with a five-day duration
 * has three days left. Zero progress leaves the duration untouched; a finished activity leaves
 * nothing. The same CPM then places what remains, over the same calendar and the same dependency
 * network, so the project has ONE answer to "when does this finish" rather than a forecast engine
 * quietly disagreeing with the planner.
 */

export type ForecastConfidence = 'MEASURED' | 'PARTLY_MEASURED' | 'DECLARED' | 'UNKNOWN';

export interface ForecastContributor {
  taskId: Id;
  name: string;
  /** The activity's authored duration, before progress is taken off it. */
  durationWorkingDays: number | null;
  /** What is left of it given what has been done. */
  remainingWorkingDays: number | null;
  /** The progress the remaining duration was computed from. */
  percentComplete: number;
  /** Whether that percentage is measured evidence or somebody's declaration (PLN-12). */
  measured: boolean;
  /** Where this activity is forecast to finish. */
  forecastFinish: string | null;
  /** Is it on the path that decides the project's finish? */
  onCriticalPath: boolean;
}

export interface ForecastCompletion {
  /** What was committed to, from the current baseline. */
  baselineFinish: string | null;
  /** What the programme says today. */
  plannedFinish: string | null;
  /** Where the work is actually heading. */
  forecastFinish: string | null;
  /** Working days late against the baseline. Negative is early. */
  varianceWorkingDays: number | null;
  /** Working days the forecast differs from the plan — how much the plan is flattering itself. */
  planOptimismWorkingDays: number | null;
  confidence: ForecastConfidence;
  /** How many of the activities driving the forecast carry measured progress. */
  measuredDrivers: number;
  driverCount: number;
  /** The activities that decide the date, in the order they run. */
  contributors: ForecastContributor[];
  /**
   * Where EVERY activity lands in this run, critical or not — not just the ones driving the date.
   *
   * Exists so anything that gates on a subset of the programme (a milestone, PLN-04) reads its date
   * out of THIS run rather than starting a second one. Two CPM passes over the same plan would
   * eventually disagree, and a project must have one answer to "when does this finish".
   *
   * An activity already complete is present with `forecastFinish: null` and `complete: true`: it
   * was excluded from the run because finished work constrains nothing, and null here means "not
   * placed in this run", never "unknown when it finishes".
   */
  placements: ForecastPlacement[];
  unknownReason: string | null;
}

export interface ForecastPlacement {
  taskId: Id;
  name: string;
  /** Null when the activity is finished, or when the programme could not be placed. */
  forecastFinish: string | null;
  remainingWorkingDays: number | null;
  percentComplete: number;
  measured: boolean;
  complete: boolean;
}

export interface ForecastInput {
  tasks: Array<{
    id: Id; name: string; plannedStart: string; plannedEnd: string;
    durationWorkingDays: number | null; percentComplete: number;
    /** From PLN-12: is that percentage measured evidence, or a declaration? */
    measured: boolean;
  }>;
  dependencies: Array<{ predecessorTaskId: Id; successorTaskId: Id }>;
  projectStart: string;
  baselineFinish: string | null;
  nonWorkingDays?: readonly string[];
  calendar?: WorkingCalendar;
}

const UNKNOWN = (unknownReason: string, over: Partial<ForecastCompletion> = {}): ForecastCompletion => ({
  baselineFinish: null, plannedFinish: null, forecastFinish: null,
  varianceWorkingDays: null, planOptimismWorkingDays: null,
  confidence: 'UNKNOWN', measuredDrivers: 0, driverCount: 0, contributors: [], placements: [],
  unknownReason, ...over,
});

/**
 * What is LEFT of an activity, given what has been done to it.
 *
 * Rounded UP, deliberately. Half a working day of work left is a working day somebody has to turn
 * up for, and a forecast that rounds remaining work down is optimistic by construction — which is
 * the direction a forecast must never be wrong in.
 */
export function remainingWorkingDays(durationWorkingDays: number | null, percentComplete: number): number | null {
  if (durationWorkingDays === null) return null;
  const done = Math.min(100, Math.max(0, Number(percentComplete) || 0));
  if (done >= 100) return 0;
  return Math.ceil(durationWorkingDays * (1 - done / 100));
}

/**
 * Forecast the completion date from what has actually been built.
 *
 * PURE, and takes the progress and the calendar as data for the reason every §22 rule does: the
 * edges are where a forecast earns its keep — nothing measured, nothing authored, everything
 * finished, and a programme that cannot be placed at all.
 */
export function forecastCompletion(input: ForecastInput): ForecastCompletion {
  const { tasks, dependencies, projectStart, baselineFinish, nonWorkingDays } = input;
  const calendar = input.calendar ?? ALL_DAYS_WORKING;

  if (tasks.length === 0) return UNKNOWN('this programme has no activities to forecast', { baselineFinish });

  const plannedFinish = tasks.reduce((latest, task) => (task.plannedEnd > latest ? task.plannedEnd : latest), tasks[0].plannedEnd);
  const known: Partial<ForecastCompletion> = { baselineFinish, plannedFinish };

  const withDependencies = (from: PlanTaskInput[]): PlanTaskInput[] => from.map((task) => ({
    ...task,
    dependencies: dependencies.filter((edge) => edge.successorTaskId === task.id).map((edge) => edge.predecessorTaskId),
  }));

  // The forecast run: each activity carries only what is LEFT of it. This is what makes the answer
  // different from the plan — and it is the same solver, so it cannot quietly disagree with it.
  const remaining = new Map(tasks.map((task) => [task.id, remainingWorkingDays(task.durationWorkingDays, task.percentComplete)]));

  // FINISHED WORK IS LEFT OUT OF THE RUN, not passed in as a zero-day activity. The planner refuses
  // a duration below one day — rightly, since an activity that takes no time is not one — so
  // including completed work would make every project with anything finished unforecastable. And a
  // finished predecessor constrains nothing: its successor can start now, which is exactly what
  // dropping it and its edges expresses.
  // Where every activity lands, whether or not it drives the date. Built from the run when there is
  // one, and still reported when there is not: a caller gating on a subset of the programme needs to
  // know an activity is finished, or unplaceable, as much as it needs a date.
  const placementsOf = (placed: Map<Id, { end: string | null }>): ForecastPlacement[] => tasks.map((task) => {
    const left = remaining.get(task.id) ?? null;
    return {
      taskId: task.id,
      name: task.name,
      forecastFinish: left === 0 ? null : placed.get(task.id)?.end ?? null,
      remainingWorkingDays: left,
      percentComplete: task.percentComplete,
      measured: task.measured,
      complete: left === 0,
    };
  });

  const outstanding = tasks.filter((task) => remaining.get(task.id) !== 0);
  if (outstanding.length === 0) {
    return UNKNOWN(
      'every activity is complete, so there is no remaining work to forecast from — what is wanted here is the actual finish, which is a different fact',
      { ...known, placements: placementsOf(new Map()) },
    );
  }
  const stillRunning = new Set(outstanding.map((task) => task.id));
  const forecast = planSchedule({
    tasks: withDependencies(outstanding.map((task) => ({
      id: task.id, name: task.name, durationWorkingDays: remaining.get(task.id) ?? null,
    }))).map((task) => ({ ...task, dependencies: task.dependencies?.filter((id) => stillRunning.has(id)) })),
    projectStart,
    nonWorkingDays,
  });

  const placed = new Map(forecast.tasks.map((task) => [task.id, task]));

  if (!forecast.established) {
    // An activity with no authored duration cannot be placed, and the planner refuses rather than
    // inventing one. A completion date from a programme that could not be built is not a forecast.
    return UNKNOWN('the programme cannot be placed, so no completion date can be forecast', {
      ...known,
      // Still reported: which activities could not be placed is exactly what somebody fixing this
      // needs, and withholding it would make the refusal unactionable.
      placements: placementsOf(placed),
    });
  }

  const onPath = new Set(forecast.criticalPath);
  const contributors: ForecastContributor[] = outstanding
    .filter((task) => onPath.has(task.id))
    .map((task) => ({
      taskId: task.id,
      name: task.name,
      durationWorkingDays: task.durationWorkingDays,
      remainingWorkingDays: remaining.get(task.id) ?? null,
      percentComplete: task.percentComplete,
      measured: task.measured,
      forecastFinish: placed.get(task.id)?.end ?? null,
      onCriticalPath: true,
    }))
    .sort((a, b) => ((a.forecastFinish ?? '') < (b.forecastFinish ?? '') ? -1 : 1));

  // CONFIDENCE TRAVELS WITH THE DATE. An activity already finished contributes no remaining work,
  // so whether its percentage was measured no longer matters to the forecast; the drivers are the
  // ones with work left, and it is their evidence that decides how much this date is worth.
  const drivers = contributors.filter((contributor) => (contributor.remainingWorkingDays ?? 0) > 0);
  const measuredDrivers = drivers.filter((contributor) => contributor.measured).length;
  const confidence: ForecastConfidence = drivers.length === 0 ? 'MEASURED'
    : measuredDrivers === drivers.length ? 'MEASURED'
    : measuredDrivers === 0 ? 'DECLARED'
    : 'PARTLY_MEASURED';

  const forecastFinish = forecast.projectFinish;
  return {
    ...(known as ForecastCompletion),
    forecastFinish,
    varianceWorkingDays: baselineFinish ? signedWorkingDays(baselineFinish, forecastFinish, calendar) : null,
    // How much the plan is flattering itself: positive means the work is heading past what the
    // programme currently claims.
    planOptimismWorkingDays: signedWorkingDays(plannedFinish, forecastFinish, calendar),
    confidence,
    measuredDrivers,
    driverCount: drivers.length,
    contributors,
    placements: placementsOf(placed),
    unknownReason: null,
  };
}
