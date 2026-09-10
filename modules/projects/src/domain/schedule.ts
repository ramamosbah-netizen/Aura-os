import { type Id, newId, roundDecimal } from '@aura/shared';
import { type NewScheduleDependency, type ScheduleDependency, validateDependencies } from './schedule-network';
import { type ResourceRef, type ResourceUnit, isResourceUnit, resourceKey, toResourceRef } from './resource-ref';

/**
 * Project Schedule (Gantt data) — one per project: an ordered list of tasks with planned dates,
 * a captured baseline (snapshot of planned at approval), actuals, and % complete. The summary
 * computes the project span, weighted % complete, and schedule variance vs the baseline finish.
 */
export interface ScheduleTask {
  /**
   * Immutable identity (DG-22.10). Assigned once and never derived from anything a person edits.
   *
   * Before this existed, a task's de facto identity was its NAME: `setScheduleTasks` rebuilt every
   * task and re-attached baselines through `Map<name, baseline>`. Two tasks called "Install CCTV"
   * collided, and renaming one silently dropped its baseline — the schedule forgot what it had
   * committed to, and nothing said so.
   */
  id: Id;
  /** Display and business data. Mutable, and never identity. */
  name: string;
  plannedStart: string; // YYYY-MM-DD
  plannedEnd: string;
  baselineStart: string | null;
  baselineEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  percentComplete: number; // 0..100
  /**
   * What this task NEEDS. Demand, never a commitment and never an assignment (DG-22.1).
   *
   * Several, because a real task needs a crew AND a crane, and one resource per task made that
   * inexpressible. A requirement is not satisfied by existing: whether the capacity is there is a
   * separate question, answered by the planner and reported as its own verdict.
   */
  requirements: TaskResourceRequirement[];
  /**
   * AUTHORED planning input: how many WORKING days the task takes. `null` means nobody has said.
   *
   * Never derived from `plannedEnd - plannedStart`. Those are calendar days and they are where the
   * task currently SITS, not a decision about how long it takes — inferring one from the other
   * would let the schedule claim somebody authored a duration when all they did was drag a bar.
   * The planner reports a null as an explicit planning deficiency rather than guessing.
   */
  durationWorkingDays: number | null;
}

export interface ProjectSchedule {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  projectName: string | null;
  tasks: ScheduleTask[];
  /**
   * The authored dependency network — finish-to-start edges between this schedule's own tasks.
   *
   * Held on the aggregate because validity is a property of the whole graph: a cycle cannot be
   * judged one edge at a time, which is why the database refuses only what a single row can be
   * judged on (self-edge, duplicate, an endpoint in another project) and the domain refuses the
   * rest.
   */
  dependencies: ScheduleDependency[];
  baselineSetAt: string | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One line of demand on a task.
 *
 * Deliberately minimal: the tenant, project and schedule are the task's, and repeating them here
 * would create four places for the same fact to disagree. The store adds them as columns so the
 * database can enforce lineage; the aggregate does not carry them twice.
 */
export interface TaskResourceRequirement {
  id: Id;
  resource: ResourceRef;
  quantity: number;
  unit: ResourceUnit;
}

export interface NewTaskResourceRequirement {
  id?: Id;
  resource: ResourceRef;
  quantity: number;
  unit: ResourceUnit;
}

export interface NewScheduleTask {
  /**
   * The task being edited. Absent means "a new task" and a fresh id is minted.
   *
   * This is what makes a save an edit rather than a replacement: a caller that round-trips ids
   * keeps every task's identity, its baseline and anything later keyed to it. A caller that omits
   * them is understood to be replacing the schedule, and the old tasks are gone — deliberately,
   * because resurrecting a deleted task by matching its name is the defect this replaces.
   */
  id?: Id;
  name: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string | null;
  actualEnd?: string | null;
  percentComplete?: number;
  /** Working days. Omitted or null means not authored; it is not inferred from the dates. */
  durationWorkingDays?: number | null;
  /** What the task needs. Round-tripped by an editing caller, like every other authored field. */
  requirements?: NewTaskResourceRequirement[];
}

export interface NewProjectSchedule {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  projectName?: string | null;
  tasks?: NewScheduleTask[];
  createdBy?: Id | null;
}

const D = /^\d{4}-\d{2}-\d{2}$/;

export function buildTask(input: NewScheduleTask): ScheduleTask {
  if (!input.name?.trim()) throw new Error('task name is required');
  if (!D.test(input.plannedStart) || !D.test(input.plannedEnd)) throw new Error('planned dates must be YYYY-MM-DD');
  if (input.plannedEnd < input.plannedStart) throw new Error('plannedEnd must be on/after plannedStart');
  const pct = Number(input.percentComplete ?? 0);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('percentComplete must be 0..100');
  const duration = input.durationWorkingDays ?? null;
  if (duration !== null && (!Number.isInteger(duration) || duration < 1)) {
    throw new Error('durationWorkingDays must be a whole number of working days, at least 1');
  }
  const requirements = buildRequirements(input.requirements ?? [], input.name);
  return {
    id: input.id ?? newId(),
    name: input.name.trim(),
    plannedStart: input.plannedStart,
    plannedEnd: input.plannedEnd,
    baselineStart: null,
    baselineEnd: null,
    actualStart: input.actualStart ?? null,
    actualEnd: input.actualEnd ?? null,
    percentComplete: pct,
    requirements,
    durationWorkingDays: duration,
  };
}

/**
 * Validate and normalise a task's demand.
 *
 * Refuses rather than repairs, and refuses loudly: a requirement quietly dropped for being
 * malformed is demand the plan will never mention again, and "missing requirement ≠ zero demand"
 * is one of the three false confidences the §22 gate forbids.
 */
function buildRequirements(
  inputs: readonly NewTaskResourceRequirement[],
  taskName: string,
): TaskResourceRequirement[] {
  const out: TaskResourceRequirement[] = [];
  const seen = new Set<string>();
  for (const r of inputs) {
    const resource = toResourceRef(r?.resource);
    if (!resource) {
      // Phrased with "must" deliberately: the global filter classifies by message shape, and this
      // is bad input the caller can fix — a 400, not an opaque 500.
      throw new Error(`a resource requirement on "${taskName}" must name a valid resource: a known type and a non-empty id`);
    }
    if (!isResourceUnit(r.unit)) {
      throw new Error(`a resource requirement on "${taskName}" must be measured in hours, persons, crews or units`);
    }
    const quantity = Number(r.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      // Zero demand is not a requirement, it is the absence of one. Storing it would put a line on
      // the screen claiming the task needs something it does not.
      throw new Error(`a resource requirement on "${taskName}" must be for more than zero`);
    }
    const k = resourceKey(resource);
    if (seen.has(k)) {
      // Two lines for one resource are one requirement recorded twice, and the planner would
      // count both — inflating demand against a capacity that never changed.
      throw new Error(`"${taskName}" requires ${k} twice; combine them into one requirement`);
    }
    seen.add(k);
    out.push({ id: r.id ?? newId(), resource, quantity, unit: r.unit });
  }
  return out.sort((a, b) => (resourceKey(a.resource) < resourceKey(b.resource) ? -1 : 1));
}

export function makeProjectSchedule(input: NewProjectSchedule): ProjectSchedule {
  if (!input.projectId) throw new Error('projectId is required');
  const tasks = (input.tasks ?? []).map(buildTask)
    .sort((a, b) => (a.plannedStart < b.plannedStart ? -1 : a.plannedStart > b.plannedStart ? 1 : (a.id < b.id ? -1 : 1)));
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    tasks,
    dependencies: [],
    baselineSetAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Replace the task set, carrying each surviving task's baseline forward BY IDENTITY.
 *
 * Previously this matched on name, which had two consequences worth naming because tests now pin
 * them: two tasks sharing a name were one key, so one stole the other's baseline; and renaming a
 * task lost the baseline entirely, because the old key no longer resolved.
 *
 * A task the caller does not send back is deleted. It is not resurrected later by a same-named
 * task — a new task gets a new id, and the baseline it never had stays absent.
 */
export function setScheduleTasks(sch: ProjectSchedule, tasks: NewScheduleTask[]): ProjectSchedule {
  const priorBaseline = new Map(sch.tasks.map((t) => [t.id, { s: t.baselineStart, e: t.baselineEnd }]));
  const next = tasks.map(buildTask).map((t) => {
    const b = priorBaseline.get(t.id);
    return b ? { ...t, baselineStart: b.s, baselineEnd: b.e } : t;
  }).sort((a, b) => (a.plannedStart < b.plannedStart ? -1 : a.plannedStart > b.plannedStart ? 1 : (a.id < b.id ? -1 : 1)));
  // An edge whose endpoint was just deleted goes with it. The database cascades on the same
  // condition; if this did not, a save would mean two different things on the two paths.
  const surviving = new Set(next.map((t) => t.id));
  const dependencies = sch.dependencies.filter(
    (d) => surviving.has(d.predecessorTaskId) && surviving.has(d.successorTaskId),
  );
  return { ...sch, tasks: next, dependencies, updatedAt: new Date().toISOString() };
}

/**
 * Replace the dependency network.
 *
 * Refuses rather than repairs. An edge naming a task that is not in this schedule is not an
 * instruction to create one, and a cycle is not something to break by dropping an edge the author
 * did not choose — the caller is told which edges form the loop and decides.
 */
export function setScheduleDependencies(
  sch: ProjectSchedule,
  edges: NewScheduleDependency[],
): ProjectSchedule {
  const verdict = validateDependencies(sch.tasks.map((t) => t.id), edges);
  if (!verdict.ok) throw new Error(verdict.reason);
  return {
    ...sch,
    dependencies: edges.map((e) => ({
      id: newId(),
      tenantId: sch.tenantId,
      projectId: sch.projectId,
      scheduleId: sch.id,
      predecessorTaskId: e.predecessorTaskId,
      successorTaskId: e.successorTaskId,
    })),
    updatedAt: new Date().toISOString(),
  };
}

/** Snapshot current planned dates into the baseline for every task. */
export function setBaseline(sch: ProjectSchedule): ProjectSchedule {
  const now = new Date().toISOString();
  return {
    ...sch,
    tasks: sch.tasks.map((t) => ({ ...t, baselineStart: t.plannedStart, baselineEnd: t.plannedEnd })),
    baselineSetAt: now,
    updatedAt: now,
  };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export interface ScheduleSummary {
  taskCount: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  percentComplete: number;   // duration-weighted
  baselineSet: boolean;
  /** Finish variance in days vs baseline (current planned end − baseline end); + = slippage. */
  scheduleVarianceDays: number;
}

export function summariseSchedule(sch: ProjectSchedule): ScheduleSummary {
  const t = sch.tasks;
  if (t.length === 0) {
    return { taskCount: 0, plannedStart: null, plannedEnd: null, percentComplete: 0, baselineSet: false, scheduleVarianceDays: 0 };
  }
  const plannedStart = t.reduce((m, x) => (x.plannedStart < m ? x.plannedStart : m), t[0].plannedStart);
  const plannedEnd = t.reduce((m, x) => (x.plannedEnd > m ? x.plannedEnd : m), t[0].plannedEnd);
  const totalDur = t.reduce((s, x) => s + Math.max(1, daysBetween(x.plannedStart, x.plannedEnd) + 1), 0);
  const doneDur = t.reduce((s, x) => s + Math.max(1, daysBetween(x.plannedStart, x.plannedEnd) + 1) * (x.percentComplete / 100), 0);
  const baselineSet = !!sch.baselineSetAt;
  const baseEnd = baselineSet ? t.reduce((m, x) => (x.baselineEnd && x.baselineEnd > m ? x.baselineEnd : m), t[0].baselineEnd ?? plannedEnd) : plannedEnd;
  return {
    taskCount: t.length,
    plannedStart,
    plannedEnd,
    percentComplete: roundDecimal((doneDur / totalDur) * 100, 1),
    baselineSet,
    scheduleVarianceDays: baselineSet ? daysBetween(baseEnd, plannedEnd) : 0,
  };
}

export const SCHEDULE_EVENT = {
  saved: 'projects.schedule.saved',
  baselineSet: 'projects.schedule.baseline_set',
  // §22 Step 11 — the governed planning chain, as events.
  planningRan: 'projects.schedule.planning_ran',
  proposalAccepted: 'projects.schedule.proposal_accepted',
  proposalDiscarded: 'projects.schedule.proposal_discarded',
} as const;
