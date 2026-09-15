import { type Id, newId } from '@aura/shared';
import { signedWorkingDays, ALL_DAYS_WORKING, type WorkingCalendar } from './working-calendar';

/**
 * §22 — a milestone: a point in the programme where something must be TRUE.
 *
 * NOT A ZERO-DURATION TASK. That is how most systems model one, and it is wrong twice over here:
 * the planner refuses a duration below one day (rightly — an activity that takes no time is not
 * one), so a milestone would have to carry a fake day that inflates every path it sits on; and a
 * milestone is not work. Nobody performs it. It is a statement about when other work must be
 * finished, which is a different kind of thing and is kept in a different place.
 *
 * THREE DATES, and the same discipline PLN-16 applies to the project's finish:
 *
 *   TARGET     what was committed to. AUTHORED, and it does not move when the plan moves. A
 *              milestone whose date follows the programme is not a commitment, it is a mirror.
 *   FORECAST   when the gating work is actually heading to finish, derived through the same CPM
 *              over the same calendar and the same dependency network.
 *   ACHIEVED   the day it was actually met — an ACT with a date, a person and a note, never a
 *              boolean somebody flipped.
 *
 * THE STATUS IS DERIVED, NEVER STORED. A stored verdict is stale the moment an activity moves, and
 * a milestone reading "on track" against a programme that slipped last week is worse than no
 * milestone at all. This is the same rule the resource conflict follows.
 *
 * AND THE CONTRADICTION IS STATED, NOT REFUSED AND NOT HIDDEN. Recording a milestone as achieved
 * while the activities that gate it are unfinished is the commonest way a programme lies to
 * management — the report goes green, the work is at forty percent, and nothing anywhere says both
 * things at once. Refusing the sign-off would be wrong too: real milestones are accepted with snags
 * by people entitled to accept them. So the achievement is recorded AND the unfinished gating work
 * is named beside it, every time it is read. Evidence never becomes a declaration, and a
 * declaration never becomes evidence.
 */

export interface ProjectMilestone {
  id: Id;
  tenantId: Id;
  projectId: Id;
  scheduleId: Id;
  name: string;
  /**
   * What was committed to. Authored, and deliberately NOT derived from the gating activities:
   * a target that recomputes itself from the plan can never be missed.
   */
  targetDate: string;
  /** Who is answerable for it. Null until somebody is named. */
  ownerId: Id | null;
  /**
   * The activities that must finish for this milestone to be true.
   *
   * May be empty, and an empty set is not "nothing to do" — it is a milestone nothing in the
   * programme gates, which reads UNKNOWN rather than ON_TRACK. A date with no work behind it is a
   * wish, and the difference is the whole point of saying so.
   */
  gatingTaskIds: Id[];
  /** The achievement, as an act. All four move together or none does. */
  achievedOn: string | null;
  achievedBy: Id | null;
  achievedNote: string | null;
  achievedAt: string | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewProjectMilestone {
  tenantId: Id;
  projectId: Id;
  scheduleId: Id;
  name: string;
  targetDate: string;
  ownerId?: Id | null;
  gatingTaskIds?: Id[];
  createdBy?: Id | null;
}

/**
 * What a milestone is, right now, derived from the work behind it.
 *
 * `MISSED` and `AT_RISK` are deliberately different words for different things: one is a fact about
 * a date that has passed, the other a prediction about one that has not. Collapsing them into
 * "late" would let a forecast be reported with the confidence of a measurement.
 */
export type MilestoneStatus = 'ACHIEVED' | 'ON_TRACK' | 'AT_RISK' | 'MISSED' | 'UNKNOWN';

export interface GatingActivity {
  taskId: Id;
  name: string;
  percentComplete: number;
  /** From PLN-12: is that percentage measured evidence, or somebody's declaration? */
  measured: boolean;
  /** Where this activity is forecast to finish. Null when it could not be placed. */
  forecastFinish: string | null;
  complete: boolean;
}

export interface MilestoneView {
  milestone: ProjectMilestone;
  status: MilestoneStatus;
  /** When the gating work is heading to finish. Null when it cannot be placed or nothing gates it. */
  forecastDate: string | null;
  /**
   * Working days between the committed date and the forecast. Positive is late.
   * Null when there is no forecast to compare — never 0, which would read as "on the date".
   */
  varianceWorkingDays: number | null;
  /** The activities this milestone waits on, named so the date can be drilled into. */
  gating: GatingActivity[];
  /** How many of them carry measured rather than declared progress. */
  measuredGating: number;
  /**
   * THE CONTRADICTION. True when an achievement is recorded and gating work is still unfinished.
   * Stated on every read, beside the achievement rather than instead of it.
   */
  achievedAgainstIncompleteWork: boolean;
  /** Which activities those are, by name, so the contradiction is actionable rather than a flag. */
  incompleteGating: GatingActivity[];
  /** Why the status is UNKNOWN, in words. Null when it is not. */
  unknownReason: string | null;
}

const D = /^\d{4}-\d{2}-\d{2}$/;

export function makeProjectMilestone(input: NewProjectMilestone): ProjectMilestone {
  if (!input.projectId) throw new Error('projectId is required');
  if (!input.scheduleId) throw new Error('scheduleId is required');
  if (!input.name?.trim()) throw new Error('a milestone must be named');
  if (!D.test(input.targetDate ?? '')) throw new Error('targetDate must be YYYY-MM-DD');
  // Two entries for one activity are one gate recorded twice, and every count downstream would
  // read the same activity as two.
  const gating = [...new Set(input.gatingTaskIds ?? [])];
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    projectId: input.projectId,
    scheduleId: input.scheduleId,
    name: input.name.trim(),
    targetDate: input.targetDate,
    ownerId: input.ownerId ?? null,
    gatingTaskIds: gating,
    achievedOn: null,
    achievedBy: null,
    achievedNote: null,
    achievedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Record that a milestone was met.
 *
 * Takes a DATE rather than stamping the clock: a milestone signed off on site on Friday and entered
 * on Monday was met on Friday, and a system that can only say "when it was typed" forces the person
 * entering it to choose between two wrong answers.
 *
 * Refuses a future date. A milestone cannot have been achieved on a day that has not happened —
 * that is not a judgement call, it is arithmetic, and accepting it would let a programme report
 * work as done before it could possibly have been.
 *
 * Does NOT refuse an achievement whose gating work is unfinished. See the header: that is recorded
 * and then stated, every time it is read.
 */
export function achieveMilestone(
  milestone: ProjectMilestone,
  input: { on: string; by?: Id | null; note?: string | null; today: string },
): ProjectMilestone {
  if (!D.test(input.on ?? '')) throw new Error('the achievement date must be YYYY-MM-DD');
  if (input.on > input.today) {
    throw new Error(`a milestone cannot be achieved on ${input.on}, which has not happened yet`);
  }
  if (milestone.achievedOn) {
    throw new Error(
      `"${milestone.name}" was already achieved on ${milestone.achievedOn}; clear that record before entering another`,
    );
  }
  return {
    ...milestone,
    achievedOn: input.on,
    achievedBy: input.by ?? null,
    achievedNote: input.note?.trim() || null,
    achievedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Withdraw an achievement.
 *
 * Kept as its own act, and requiring a reason, for the reason re-baselining does (PLN-05): a
 * milestone that has been reported as met is a thing other people have acted on, and un-meeting it
 * silently is how a management report changes its mind without saying so.
 */
export function clearMilestoneAchievement(
  milestone: ProjectMilestone,
  input: { reason: string; by?: Id | null },
): ProjectMilestone {
  if (!milestone.achievedOn) {
    // "can only" is what the global filter classifies as a 409 state conflict, which is what this
    // is: the request is well formed, and it is the milestone's current state that forbids it.
    throw new Error(`an achievement can only be withdrawn from a milestone that has one, and "${milestone.name}" does not`);
  }
  if (!input.reason?.trim()) {
    // Phrased to avoid the word "already": the global filter classifies a message carrying it as a
    // 409 state conflict, and this is bad input the caller can fix — a 400.
    throw new Error('withdrawing a milestone achievement requires a reason: it has been reported as met and other people have acted on it');
  }
  return {
    ...milestone,
    achievedOn: null,
    achievedBy: null,
    // The reason replaces the note rather than being lost: what is on the record is why it was
    // withdrawn, which is the fact somebody reading this next actually needs.
    achievedNote: `withdrawn by ${input.by ?? 'unknown'}: ${input.reason.trim()}`,
    achievedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * What this milestone is, given the programme as it stands today.
 *
 * PURE, and takes the gating activities and the calendar as data — the edges are where a milestone
 * earns its keep: nothing gating it, gating work that cannot be placed, an achievement recorded
 * against unfinished work, and a target date that has quietly passed.
 */
export function resolveMilestone(input: {
  milestone: ProjectMilestone;
  gating: GatingActivity[];
  today: string;
  calendar?: WorkingCalendar;
}): MilestoneView {
  const { milestone, gating, today } = input;
  const calendar = input.calendar ?? ALL_DAYS_WORKING;
  const incompleteGating = gating.filter((activity) => !activity.complete);
  const measuredGating = gating.filter((activity) => activity.measured).length;

  // The forecast is the LATEST of the gating finishes: a milestone is true when the last of the
  // work behind it is done, not the first.
  const placed = gating.filter((activity) => activity.forecastFinish !== null);
  const forecastDate = placed.length === 0 ? null : placed.reduce<string>(
    (latest, activity) => (activity.forecastFinish! > latest ? activity.forecastFinish! : latest),
    placed[0].forecastFinish!,
  );

  const base = {
    milestone,
    forecastDate,
    gating,
    measuredGating,
    incompleteGating,
    // An achievement standing against work that is not finished. Stated whenever both are true,
    // and it survives every branch below — including ACHIEVED, which is the branch that matters.
    achievedAgainstIncompleteWork: milestone.achievedOn !== null && incompleteGating.length > 0,
  };

  if (milestone.achievedOn) {
    // An achieved milestone has no variance against a forecast: it happened. What it CAN be
    // measured against is the date it was committed to, and that is the figure reported.
    return {
      ...base,
      status: 'ACHIEVED',
      varianceWorkingDays: signedWorkingDays(milestone.targetDate, milestone.achievedOn, calendar),
      unknownReason: null,
    };
  }

  if (gating.length === 0) {
    return {
      ...base,
      status: 'UNKNOWN',
      varianceWorkingDays: null,
      unknownReason: 'no activity in this programme gates this milestone, so nothing can be said about when it will be met',
    };
  }

  if (forecastDate === null) {
    // Every gating activity is unplaceable — an unauthored duration somewhere. Substituting one
    // would produce a confident date built on a number nobody chose.
    return {
      ...base,
      status: 'UNKNOWN',
      varianceWorkingDays: null,
      unknownReason: 'the work behind this milestone cannot be placed, so no date can be forecast for it',
    };
  }

  const varianceWorkingDays = signedWorkingDays(milestone.targetDate, forecastDate, calendar);

  // A date that has passed with nothing recorded is a FACT, and it outranks any forecast: the
  // forecast may still say next Tuesday, but the committed day came and went.
  if (milestone.targetDate < today) {
    return { ...base, status: 'MISSED', varianceWorkingDays, unknownReason: null };
  }

  return {
    ...base,
    status: varianceWorkingDays > 0 ? 'AT_RISK' : 'ON_TRACK',
    varianceWorkingDays,
    unknownReason: null,
  };
}

export const MILESTONE_EVENT = {
  created: 'projects.milestone.created',
  achieved: 'projects.milestone.achieved',
  withdrawn: 'projects.milestone.withdrawn',
} as const;
