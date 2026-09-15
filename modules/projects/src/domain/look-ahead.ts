import type { Id } from '@aura/shared';
import { workingDaysInRange, ALL_DAYS_WORKING, type WorkingCalendar } from './working-calendar';

/**
 * §22 — the next two to six weeks, read off the accepted programme.
 *
 * A look-ahead is the meeting every site runs on: what must happen in the coming weeks, what it
 * needs, and what is not ready. It is the one planning artefact people most often keep in a
 * spreadsheet, and the moment they do it disagrees with the programme — someone extends an
 * activity, nobody retypes the look-ahead, and the meeting is held against a plan that no longer
 * exists.
 *
 * So this is DERIVED and stored nowhere. It is a WINDOW over the plan, not a document beside it:
 * every date, dependency, requirement and measurement in it is the one the programme already
 * holds, and it is recomputed on every read for the same reason progress and feasibility are.
 *
 * READY IS ESTABLISHED, NEVER ASSUMED. An activity is ready only when every fact needed to say so
 * is positively known: its predecessors finish before it starts, every resource it needs is
 * committed, and every commitment is feasible. An activity with an UNKNOWN among those is UNKNOWN —
 * not ready — because "we could not find a problem" and "there is no problem" are different
 * statements, and a look-ahead that rounds the first to the second sends a crew to a site that is
 * not open.
 *
 * QUANTITIES AGGREGATE BY WORK PACKAGE, NEVER BY ACTIVITY. Several activities may deliver one
 * package, and each reads that package's whole sold quantity because no apportionment has ever been
 * authored (PLN-11's recorded limit). Summing them per activity would count the same 200 m² twice
 * and report 400. Until an apportionment authority exists, a package contributes exactly one row
 * however many activities point at it, and the activities are named on that row.
 */

export type LookAheadReadiness = 'READY' | 'NOT_READY' | 'UNKNOWN';

export interface LookAheadRequirement {
  id: Id;
  resourceType: string;
  canonicalResourceId: Id;
  quantity: number;
  unit: string;
  /** Has this demand been turned into a held commitment? */
  committed: boolean;
  /** The commitment's current feasibility, when there is one. */
  feasibility: 'AVAILABLE' | 'CONFLICTED' | 'UNKNOWN' | null;
}

export interface LookAheadPredecessor {
  taskId: Id;
  name: string;
  plannedEnd: string;
  /** Does it finish before the successor is due to start? */
  clearsInTime: boolean;
}

export interface LookAheadActivity {
  taskId: Id;
  name: string;
  wbsNodeId: Id | null;
  plannedStart: string;
  plannedEnd: string;
  /** Working days of THIS activity that fall inside the look-ahead window. */
  workingDaysInWindow: number;
  /** New work starting in the window, as against work carried in from before it. */
  startsInWindow: boolean;
  requirements: LookAheadRequirement[];
  waitsFor: LookAheadPredecessor[];
  readiness: LookAheadReadiness;
  /** Why it is not ready, or why nobody can say. Empty only when READY. */
  reasons: string[];
}

export interface LookAheadPackage {
  wbsNodeId: Id;
  plannedQuantity: number | null;
  installedQuantity: number | null;
  unit: string | null;
  /** Every activity in the window delivering this package — named, never summed. */
  activityIds: Id[];
}

export interface LookAhead {
  from: string;
  to: string;
  weeks: number;
  /** Working days in the window itself, under the project's calendar. */
  workingDays: number;
  calendarName: string | null;
  everyDayWorked: boolean;
  activities: LookAheadActivity[];
  packages: LookAheadPackage[];
}

export interface LookAheadInput {
  today: string;
  weeks: number;
  calendar?: WorkingCalendar;
  calendarName?: string | null;
  everyDayWorked?: boolean;
  tasks: Array<{
    id: Id;
    name: string;
    wbsNodeId: Id | null;
    plannedStart: string;
    plannedEnd: string;
    percentComplete: number;
    requirements: Array<{ id: Id; resource: { resourceType: string; canonicalResourceId: Id }; quantity: number; unit: string }>;
  }>;
  dependencies: Array<{ predecessorTaskId: Id; successorTaskId: Id }>;
  /** Held commitments keyed by the requirement they satisfy, with their current feasibility. */
  commitments: Map<Id, { feasibility: 'AVAILABLE' | 'CONFLICTED' | 'UNKNOWN' }>;
  /** What each work package was sold and has installed — by package, because that is where it lives. */
  packages: Map<Id, { plannedQuantity: number | null; installedQuantity: number | null; unit: string | null }>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `offset` days after `from`, as a date. */
function addDays(from: string, offset: number): string {
  const day = new Date(`${from}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

/** Do two inclusive date ranges share at least one day? */
const overlaps = (aFrom: string, aTo: string, bFrom: string, bTo: string): boolean => aFrom <= bTo && bFrom <= aTo;

/**
 * Resolve the look-ahead window over an accepted programme.
 *
 * PURE, and takes every fact as data: the readiness rule is the whole value here, and a rule that
 * queries is a rule you cannot test at the edge that matters — the activity that looks fine and is
 * not.
 */
export function resolveLookAhead(input: LookAheadInput): LookAhead {
  const { today, tasks, dependencies, commitments, packages } = input;
  // A length that is not a number is "not asked for" and defaults; a number that IS asked for is
  // clamped rather than defaulted, so a request for zero weeks is not silently read as three.
  const asked = Number(input.weeks);
  const weeks = Number.isFinite(asked) ? Math.min(12, Math.max(1, Math.trunc(asked))) : 3;
  const calendar = input.calendar ?? ALL_DAYS_WORKING;
  const from = today;
  const to = addDays(today, weeks * 7 - 1);

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const predecessorsOf = new Map<Id, Id[]>();
  for (const edge of dependencies) {
    predecessorsOf.set(edge.successorTaskId, [...(predecessorsOf.get(edge.successorTaskId) ?? []), edge.predecessorTaskId]);
  }

  const inWindow = tasks.filter((task) =>
    DATE.test(task.plannedStart) && DATE.test(task.plannedEnd) && overlaps(task.plannedStart, task.plannedEnd, from, to));

  const activities: LookAheadActivity[] = inWindow.map((task) => {
    // Only the part of the activity that falls INSIDE the window: an activity running for three
    // months is not three months of work in the next three weeks.
    const sliceFrom = task.plannedStart > from ? task.plannedStart : from;
    const sliceTo = task.plannedEnd < to ? task.plannedEnd : to;
    const workingDaysInWindow = workingDaysInRange(sliceFrom, sliceTo, calendar).length;

    const requirements: LookAheadRequirement[] = task.requirements.map((requirement) => {
      const commitment = commitments.get(requirement.id);
      return {
        id: requirement.id,
        resourceType: requirement.resource.resourceType,
        canonicalResourceId: requirement.resource.canonicalResourceId,
        quantity: requirement.quantity,
        unit: requirement.unit,
        committed: !!commitment,
        feasibility: commitment?.feasibility ?? null,
      };
    });

    const waitsFor: LookAheadPredecessor[] = (predecessorsOf.get(task.id) ?? [])
      .map((predecessorId) => byId.get(predecessorId))
      .filter((predecessor): predecessor is NonNullable<typeof predecessor> => !!predecessor)
      .map((predecessor) => ({
        taskId: predecessor.id,
        name: predecessor.name,
        plannedEnd: predecessor.plannedEnd,
        // Finish-to-start: the predecessor must be done before this one is due to begin.
        clearsInTime: predecessor.plannedEnd < task.plannedStart,
      }));

    const reasons: string[] = [];
    let unknown = false;

    for (const predecessor of waitsFor) {
      if (!predecessor.clearsInTime) {
        reasons.push(`waits for “${predecessor.name}”, which is not planned to finish until ${predecessor.plannedEnd}`);
      }
    }
    for (const requirement of requirements) {
      if (!requirement.committed) {
        reasons.push(`${requirement.quantity} ${requirement.unit} of ${requirement.resourceType} is needed and not committed`);
      } else if (requirement.feasibility === 'CONFLICTED') {
        reasons.push(`the ${requirement.resourceType} committed to this activity is over-committed for these days`);
      } else if (requirement.feasibility === 'UNKNOWN') {
        // Not a problem found, and not an absence of one: nobody declared the capacity.
        unknown = true;
        reasons.push(`nobody has declared capacity for the ${requirement.resourceType} this activity needs`);
      }
    }

    const readiness: LookAheadReadiness = reasons.length === 0 ? 'READY' : unknown && reasons.length === 1 ? 'UNKNOWN' : 'NOT_READY';
    return {
      taskId: task.id,
      name: task.name,
      wbsNodeId: task.wbsNodeId,
      plannedStart: task.plannedStart,
      plannedEnd: task.plannedEnd,
      workingDaysInWindow,
      startsInWindow: task.plannedStart >= from,
      requirements,
      waitsFor,
      readiness,
      reasons,
    };
  }).sort((a, b) => (a.plannedStart === b.plannedStart ? a.name.localeCompare(b.name) : a.plannedStart < b.plannedStart ? -1 : 1));

  // ONE ROW PER PACKAGE, however many activities point at it. See the note at the top of this file:
  // each activity reads its package's whole sold quantity, so summing per activity would report the
  // same scope twice.
  const packageRows = new Map<Id, LookAheadPackage>();
  for (const activity of activities) {
    if (!activity.wbsNodeId) continue;
    const existing = packageRows.get(activity.wbsNodeId);
    if (existing) {
      existing.activityIds.push(activity.taskId);
      continue;
    }
    const facts = packages.get(activity.wbsNodeId);
    packageRows.set(activity.wbsNodeId, {
      wbsNodeId: activity.wbsNodeId,
      plannedQuantity: facts?.plannedQuantity ?? null,
      installedQuantity: facts?.installedQuantity ?? null,
      unit: facts?.unit ?? null,
      activityIds: [activity.taskId],
    });
  }

  return {
    from,
    to,
    weeks,
    workingDays: workingDaysInRange(from, to, calendar).length,
    calendarName: input.calendarName ?? null,
    everyDayWorked: input.everyDayWorked ?? true,
    activities,
    packages: [...packageRows.values()],
  };
}
