import { type Id, newId } from '@aura/shared';

/**
 * Project Schedule (Gantt data) — one per project: an ordered list of tasks with planned dates,
 * a captured baseline (snapshot of planned at approval), actuals, and % complete. The summary
 * computes the project span, weighted % complete, and schedule variance vs the baseline finish.
 */
export interface ScheduleTask {
  name: string;
  plannedStart: string; // YYYY-MM-DD
  plannedEnd: string;
  baselineStart: string | null;
  baselineEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  percentComplete: number; // 0..100
}

export interface ProjectSchedule {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  projectName: string | null;
  tasks: ScheduleTask[];
  baselineSetAt: string | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewScheduleTask {
  name: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string | null;
  actualEnd?: string | null;
  percentComplete?: number;
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
  return {
    name: input.name.trim(),
    plannedStart: input.plannedStart,
    plannedEnd: input.plannedEnd,
    baselineStart: null,
    baselineEnd: null,
    actualStart: input.actualStart ?? null,
    actualEnd: input.actualEnd ?? null,
    percentComplete: pct,
  };
}

export function makeProjectSchedule(input: NewProjectSchedule): ProjectSchedule {
  if (!input.projectId) throw new Error('projectId is required');
  const tasks = (input.tasks ?? []).map(buildTask).sort((a, b) => (a.plannedStart < b.plannedStart ? -1 : 1));
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    tasks,
    baselineSetAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Replace tasks (baseline dates preserved by name where they already exist). */
export function setScheduleTasks(sch: ProjectSchedule, tasks: NewScheduleTask[]): ProjectSchedule {
  const priorBaseline = new Map(sch.tasks.map((t) => [t.name, { s: t.baselineStart, e: t.baselineEnd }]));
  const next = tasks.map(buildTask).map((t) => {
    const b = priorBaseline.get(t.name);
    return b ? { ...t, baselineStart: b.s, baselineEnd: b.e } : t;
  }).sort((a, b) => (a.plannedStart < b.plannedStart ? -1 : 1));
  return { ...sch, tasks: next, updatedAt: new Date().toISOString() };
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
    percentComplete: Math.round((doneDur / totalDur) * 1000) / 10,
    baselineSet,
    scheduleVarianceDays: baselineSet ? daysBetween(baseEnd, plannedEnd) : 0,
  };
}

export const SCHEDULE_EVENT = {
  saved: 'projects.schedule.saved',
  baselineSet: 'projects.schedule.baseline_set',
} as const;
