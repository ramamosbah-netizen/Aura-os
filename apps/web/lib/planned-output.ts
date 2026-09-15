/**
 * What an activity's progress is measured AGAINST — one phrasing, for every screen that shows it.
 *
 * `/api/projects/schedules` returns an `output` map beside each plan, derived by the API on every
 * read from four facts it does not own: the quantity the award line sold, the rate it was priced
 * at (frozen with the award), what site has installed, and how much of the activity's own planned
 * window has been used.
 *
 * The verdict is never invented here. UNKNOWN comes back with the reason nobody can answer, and
 * this file's job is to say that reason out loud rather than round it to "on track" — a plan the
 * system cannot check is not a plan it agrees with.
 *
 * See modules/projects/src/domain/planned-output.ts for the rule itself.
 */

export type OutputVerdict = 'AHEAD' | 'ON_RATE' | 'BEHIND' | 'UNKNOWN';

export interface PlannedOutput {
  plannedQuantity: number | null;
  unit: string | null;
  installedQuantity: number | null;
  basis: {
    crewSize: number;
    manHoursPerUnit: number;
    crewHoursPerUnit: number;
    engineerManHoursPerUnit: number;
    projectManagerManHoursPerUnit: number;
    estimateId: string | null;
  } | null;
  pricedRatePerDay: number | null;
  pricedCrewDays: number | null;
  achievedRatePerDay: number | null;
  requiredRatePerDay: number | null;
  expectedByNow: number | null;
  verdict: OutputVerdict;
  unknownReason: string | null;
}

/** Any schedule payload from `/api/projects/schedules`. */
export interface OutputBearingSchedule {
  output?: Record<string, PlannedOutput> | null;
}

export const outputOf = (
  schedule: OutputBearingSchedule | null | undefined,
  task: { id?: string | null },
): PlannedOutput | null => (task.id ? schedule?.output?.[task.id] ?? null : null);

const rate = (value: number | null, unit: string | null): string =>
  value === null ? '—' : `${value}${unit ? ` ${unit}` : ''}/day`;

/**
 * One line a planner can act on: the pace against the pace the work was sold at.
 *
 * Returns null where there is nothing worth saying — a package with no award line behind it is the
 * ordinary case for most activities, and printing "unknown" under every bar would train people to
 * stop reading the ones that matter.
 */
export function outputSummary(output: PlannedOutput | null): { tone: OutputVerdict; text: string } | null {
  if (!output) return null;
  const { unit, verdict } = output;
  if (verdict === 'UNKNOWN') {
    // Worth saying only when something WAS sold — otherwise this activity simply has no award line
    // behind it, which is not news.
    if (output.plannedQuantity === null) return null;
    return { tone: 'UNKNOWN', text: `No rate can be judged · ${output.unknownReason ?? 'not enough is known'}` };
  }
  const achieved = rate(output.achievedRatePerDay, unit);
  const priced = rate(output.pricedRatePerDay, unit);
  const label = verdict === 'BEHIND' ? 'Behind the priced rate'
    : verdict === 'AHEAD' ? 'Ahead of the priced rate'
    : 'At the priced rate';
  const needed = verdict === 'BEHIND' && output.requiredRatePerDay !== null
    ? ` · ${rate(output.requiredRatePerDay, unit)} needed to finish in the window`
    : '';
  return { tone: verdict, text: `${label} · ${achieved} against ${priced} priced${needed}` };
}

/** What was sold and what is in, for a screen that wants the quantities rather than the pace. */
export function soldAndInstalled(output: PlannedOutput | null): string | null {
  if (!output || output.plannedQuantity === null) return null;
  const unit = output.unit ? ` ${output.unit}` : '';
  return output.installedQuantity === null
    ? `${output.plannedQuantity}${unit} sold · nothing measured yet`
    : `${output.installedQuantity} of ${output.plannedQuantity}${unit} installed`;
}

/** How many activities are behind the rate their work was priced at. */
export function behindCount(
  schedules: Array<OutputBearingSchedule & { tasks: Array<{ id?: string | null }> }>,
): number {
  return schedules.reduce((total, schedule) =>
    total + schedule.tasks.filter((task) => outputOf(schedule, task)?.verdict === 'BEHIND').length, 0);
}
