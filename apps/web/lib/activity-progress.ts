/**
 * What a schedule activity's progress actually is — one definition, for every screen that shows it.
 *
 * `/api/projects/schedules` returns a `progress` map beside each plan, DERIVED by the API on every
 * read: the measurement belongs to the work package and its Quantity Ledger, and a copy stored on
 * the activity would be a copy as of the last refresh.
 *
 * `task.percentComplete` remains on the activity and is still the number a planner types — but it
 * is the DECLARED figure, authoritative only where nothing has been measured. Any surface reading
 * it directly will quietly disagree with the plan screen the moment site installs something, which
 * is why this lives in one place rather than being spelled out per component.
 *
 * See modules/projects/src/domain/activity-progress.ts for the rule itself.
 */

export type ActivityProgressSource = 'evidence' | 'override' | 'declared';

export interface ResolvedActivityProgress {
  /** What to show. `null` means nobody can say yet — which is NOT zero. */
  effective: number | null;
  source: ActivityProgressSource;
  /** The work package's measured progress, where the package is quantity-controlled. */
  evidence: number | null;
  /** Somebody stating a figure against that measurement, with a reason. */
  override: { value: number; reason: string; at: string; by: string | null } | null;
}

/** Any schedule payload from `/api/projects/schedules`. */
export interface ProgressBearingSchedule {
  progress?: Record<string, ResolvedActivityProgress> | null;
}

/**
 * The figure to display for one activity.
 *
 * Falls back to the declared number when the plan was read from a surface that does not carry the
 * map (an older cached payload, a narrower endpoint) — the same number that was shown before any
 * of this existed, never a silent zero.
 */
export function activityProgress(
  schedule: ProgressBearingSchedule | null | undefined,
  task: { id?: string | null; percentComplete: number },
): number {
  const resolved = task.id ? schedule?.progress?.[task.id] : undefined;
  return resolved?.effective ?? task.percentComplete;
}

/** Is this activity's figure measured (or stated against a measurement) rather than merely typed? */
export function isMeasured(
  schedule: ProgressBearingSchedule | null | undefined,
  task: { id?: string | null },
): boolean {
  const resolved = task.id ? schedule?.progress?.[task.id] : undefined;
  return Boolean(resolved && resolved.source !== 'declared');
}

/**
 * A short, plain label for where an activity's figure came from, for tables that show the number
 * and the reader's reason to believe it side by side.
 */
export function progressSource(
  schedule: ProgressBearingSchedule | null | undefined,
  task: { id?: string | null },
): string {
  const resolved = task.id ? schedule?.progress?.[task.id] : undefined;
  if (!resolved || resolved.source === 'declared') return 'Declared';
  if (resolved.source === 'override') return `Stated against a measured ${resolved.evidence}%`;
  return 'Measured from installed quantity';
}

/**
 * How many of a set of activities carry a measurement, so a headline can say what it is made of.
 * "62%" means something different when none of it is measured, and a single number cannot carry
 * that difference on its own.
 */
export function measuredNote(
  schedules: Array<ProgressBearingSchedule & { tasks: Array<{ id?: string | null }> }>,
): string {
  const total = schedules.reduce((sum, schedule) => sum + schedule.tasks.length, 0);
  if (total === 0) return 'not established';
  const measured = schedules.reduce(
    (sum, schedule) => sum + schedule.tasks.filter((task) => isMeasured(schedule, task)).length, 0);
  return measured === 0
    ? 'declared — none measured from site quantity'
    : `${measured} of ${total} measured from site quantity`;
}
