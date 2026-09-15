import type { Id } from '@aura/shared';

/**
 * §22 — where an activity's progress comes from.
 *
 * A percentage on a plan is not one fact. It is one of three, and the whole value of this file is
 * refusing to let them wear each other's clothes:
 *
 *   evidence    the work package's progress, derived from approved installed quantity through the
 *               Quantity Ledger. Not stored on the activity, and not stored twice: a copy is a
 *               copy as of the last refresh, which is the same mistake as a stored feasibility
 *               verdict (see resource-booking.ts on why feasibility is not a column).
 *   override    somebody stating a different figure against that evidence, with a reason and a
 *               name. Permitted — a site can be genuinely ahead of what has been measured — but
 *               never silent.
 *   declared    a plain number where no evidence exists at all. This is what every activity has
 *               carried until now, and it stays exactly as it was; what changes is that it is
 *               LABELLED rather than passing for measurement.
 *
 * AN OVERRIDE ONLY EXISTS WHERE EVIDENCE DOES. Without evidence, a number overrides nothing — it
 * is the only statement there is, and calling it an override would imply a measurement it
 * contradicts. That rule is what keeps `declared` from quietly becoming the norm.
 *
 * UNKNOWN IS NOT ZERO. An activity linked to a quantity-controlled package whose ledger cannot yet
 * answer reports `null`, not `0`: nobody has installed nothing, nobody has measured yet, and a bar
 * drawn at zero says the first while meaning the second.
 */

export type ActivityProgressSource = 'evidence' | 'override' | 'declared';

export interface ActivityProgressOverride {
  value: number;
  /** Why this differs from what was measured. Required — see the note above. */
  reason: string;
  at: string;
  by: Id | null;
}

export interface ActivityProgress {
  /** What the plan should show and every rollup should use. `null` = nobody can say yet. */
  effective: number | null;
  source: ActivityProgressSource;
  /** The work package's measured progress, when the package is quantity-controlled. */
  evidence: number | null;
  /** In force only when evidence exists to override. */
  override: ActivityProgressOverride | null;
}

const clamp = (value: number): number => Math.min(100, Math.max(0, value));

/**
 * Resolve what an activity's progress actually is.
 *
 * PURE, and takes the evidence as data for the same reason every other rule in §22 does: a rule
 * that queries is a rule you cannot test at every edge, and this one decides what a whole
 * programme's earned value is computed from.
 *
 * `evidence` is `null` when the activity names no work package, the package is not
 * quantity-controlled, or the ledger cannot answer for it yet. Each of those is "no measurement",
 * and none of them is a measurement of zero.
 */
export function resolveActivityProgress(
  task: { percentComplete: number; progressOverride: number | null; progressOverrideReason: string | null; progressOverrideAt: string | null; progressOverrideBy: Id | null },
  evidence: number | null,
): ActivityProgress {
  if (evidence === null) {
    // No measurement to override. Whatever number the plan holds is a declaration, and an override
    // recorded before the link existed is not promoted into one now.
    return { effective: clamp(task.percentComplete), source: 'declared', evidence: null, override: null };
  }
  if (task.progressOverride !== null && task.progressOverrideReason && task.progressOverrideAt) {
    return {
      effective: clamp(task.progressOverride),
      source: 'override',
      evidence,
      override: {
        value: clamp(task.progressOverride),
        reason: task.progressOverrideReason,
        at: task.progressOverrideAt,
        by: task.progressOverrideBy,
      },
    };
  }
  return { effective: evidence, source: 'evidence', evidence, override: null };
}

/** Does the plan currently claim something other than what was measured? */
export const progressDisagreesWithEvidence = (progress: ActivityProgress): boolean =>
  progress.source === 'override' && progress.evidence !== null && progress.effective !== progress.evidence;

export interface ProgressOverrideInput {
  value: number;
  reason: string;
  actorId?: Id | null;
}

/**
 * State a figure against the evidence.
 *
 * Refused outright where there is no evidence: the caller is not overriding anything, and letting
 * it through would put a reason and a signature on what is really just a typed number — making it
 * look more governed than the plain declaration it is.
 */
export function overrideActivityProgress<T extends { percentComplete: number }>(
  task: T,
  input: ProgressOverrideInput,
  evidence: number | null,
): T & { progressOverride: number; progressOverrideReason: string; progressOverrideAt: string; progressOverrideBy: Id | null } {
  if (evidence === null) {
    throw new Error('this activity has no measured progress, so there is nothing to override; record the figure on the activity instead');
  }
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('overridden progress must be between 0 and 100');
  }
  const reason = input.reason?.trim();
  if (!reason) {
    throw new Error('overriding measured progress requires a reason');
  }
  return {
    ...task,
    progressOverride: clamp(value),
    progressOverrideReason: reason,
    progressOverrideAt: new Date().toISOString(),
    progressOverrideBy: input.actorId ?? null,
  };
}

/** Withdraw the override and let the measurement speak again. */
export function clearActivityProgressOverride<T extends { progressOverride: number | null }>(
  task: T,
): T & { progressOverride: null; progressOverrideReason: null; progressOverrideAt: null; progressOverrideBy: null } {
  if (task.progressOverride === null) throw new Error('this activity is not overriding its measured progress, so there is nothing to withdraw');
  // The provenance clears with it: a reason beside no override would read as one still in force.
  return { ...task, progressOverride: null, progressOverrideReason: null, progressOverrideAt: null, progressOverrideBy: null };
}
