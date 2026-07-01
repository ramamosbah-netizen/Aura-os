/**
 * Schedule planning engine — framework-free. Two algorithms the stored Gantt lacked:
 *
 *  1. **Reactive rescheduling (CPM forward pass):** given task durations + finish-to-start
 *     dependencies (with optional lag) and a project start, compute each task's start/finish so
 *     a task never starts before its predecessors finish. Re-runnable whenever durations/links
 *     change — the "fully reactive rescheduling" the UI needed.
 *  2. **Resource levelling:** given each task's resource + units and a per-resource daily
 *     capacity, delay tasks (respecting dependency order) so no resource is over-allocated on
 *     any day. Returns the leveled plan + per-resource peak load.
 *
 * Dates are YYYY-MM-DD; durations are in whole days (a 1-day task starts and finishes same day).
 */

export interface PlanTaskInput {
  id: string;
  name: string;
  durationDays: number;
  /** Finish-to-start predecessors by task id. */
  dependencies?: string[];
  /** Lag (days) applied after the latest predecessor finish. */
  lagDays?: number;
  resource?: string | null;
  /** Resource units consumed per day this task is active (default 1). */
  resourceUnits?: number;
  /** Levelling delay (days) applied to the task's computed start, regardless of dependencies. */
  delayDays?: number;
}

export interface PlannedTask {
  id: string;
  name: string;
  durationDays: number;
  dependencies: string[];
  start: string;   // YYYY-MM-DD
  end: string;     // YYYY-MM-DD (inclusive)
  resource: string | null;
  resourceUnits: number;
  /** True when the task has zero total float (drives project finish). */
  critical: boolean;
}

export interface SchedulePlan {
  projectStart: string;
  projectFinish: string;
  durationDays: number;
  tasks: PlannedTask[];
  criticalPath: string[];
  resourcePeaks: Array<{ resource: string; peakUnits: number; capacity: number; overallocated: boolean }>;
}

const MS_DAY = 86_400_000;
const toDate = (s: string): number => Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
const fromDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const addDays = (s: string, n: number): string => fromDate(toDate(s) + n * MS_DAY);
const dayCount = (a: string, b: string): number => Math.round((toDate(b) - toDate(a)) / MS_DAY);

/** Topological order over finish-to-start deps; throws on a cycle. */
function topoOrder(tasks: PlanTaskInput[]): PlanTaskInput[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map<string, 0 | 1 | 2>(); // 0 unseen, 1 visiting, 2 done
  const out: PlanTaskInput[] = [];
  const visit = (id: string, trail: string[]): void => {
    const s = state.get(id) ?? 0;
    if (s === 2) return;
    if (s === 1) throw new Error(`schedule dependency cycle: ${[...trail, id].join(' → ')}`);
    const t = byId.get(id);
    if (!t) throw new Error(`unknown dependency id: ${id}`);
    state.set(id, 1);
    for (const dep of t.dependencies ?? []) visit(dep, [...trail, id]);
    state.set(id, 2);
    out.push(t);
  };
  for (const t of tasks) visit(t.id, []);
  return out;
}

const dur = (t: PlanTaskInput): number => Math.max(1, Math.floor(Number(t.durationDays) || 1));

/** CPM forward pass: earliest start/finish honouring finish-to-start deps + lag. */
export function reschedule(tasks: PlanTaskInput[], projectStart: string): Map<string, { start: string; end: string }> {
  const ordered = topoOrder(tasks);
  const sched = new Map<string, { start: string; end: string }>();
  for (const t of ordered) {
    let start = projectStart;
    for (const dep of t.dependencies ?? []) {
      const ds = sched.get(dep);
      if (ds) {
        const earliest = addDays(ds.end, 1 + (Number(t.lagDays) || 0)); // day after predecessor finish (+lag)
        if (toDate(earliest) > toDate(start)) start = earliest;
      }
    }
    // Levelling delay floors the start regardless of dependencies (moves independent tasks too).
    const delay = Number(t.delayDays) || 0;
    if (delay > 0) start = addDays(start, delay);
    sched.set(t.id, { start, end: addDays(start, dur(t) - 1) });
  }
  return sched;
}

/** Backward pass to find zero-float (critical) tasks given a forward schedule + project finish. */
function markCritical(tasks: PlanTaskInput[], fwd: Map<string, { start: string; end: string }>, finish: string): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const successors = new Map<string, string[]>();
  for (const t of tasks) for (const d of t.dependencies ?? []) successors.set(d, [...(successors.get(d) ?? []), t.id]);
  const lateFinish = new Map<string, number>();
  const order = topoOrder(tasks).reverse();
  for (const t of order) {
    const succs = successors.get(t.id) ?? [];
    let lf = toDate(finish);
    for (const s of succs) {
      const sBy = byId.get(s)!;
      const sLateStart = (lateFinish.get(s) ?? toDate(finish)) - (dur(sBy) - 1) * MS_DAY;
      const cand = sLateStart - (1 + (Number(sBy.lagDays) || 0)) * MS_DAY;
      if (cand < lf) lf = cand;
    }
    lateFinish.set(t.id, lf);
  }
  const critical = new Set<string>();
  for (const t of tasks) {
    const ef = toDate(fwd.get(t.id)!.end);
    if (Math.abs((lateFinish.get(t.id) ?? ef) - ef) < MS_DAY / 2) critical.add(t.id);
  }
  return critical;
}

/**
 * Resource levelling: over the forward schedule, walk days in order and, when a resource's
 * daily load would exceed capacity, delay the lowest-priority (latest, non-started) task by a
 * day — repeating until no day is over capacity. Dependency order is preserved because a delayed
 * task's successors are re-pushed via `reschedule` on each pass.
 */
export function planSchedule(
  tasks: PlanTaskInput[],
  projectStart: string,
  capacity: Record<string, number> = {},
): SchedulePlan {
  if (tasks.length === 0) {
    return { projectStart, projectFinish: projectStart, durationDays: 0, tasks: [], criticalPath: [], resourcePeaks: [] };
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const extraLag = new Map<string, number>(); // resource-levelling delay added per task (days)

  const runForward = (): Map<string, { start: string; end: string }> => {
    const adjusted = tasks.map((t) => ({ ...t, delayDays: (Number(t.delayDays) || 0) + (extraLag.get(t.id) ?? 0) }));
    return reschedule(adjusted, projectStart);
  };

  // Iteratively resolve over-allocations (bounded to avoid pathological loops).
  for (let pass = 0; pass < tasks.length * 366; pass++) {
    const sched = runForward();
    // Build daily load per resource.
    const load = new Map<string, Map<number, string[]>>(); // resource -> dayIndex -> taskIds
    for (const t of tasks) {
      const res = t.resource ?? null;
      if (!res || !(res in capacity)) continue;
      const { start, end } = sched.get(t.id)!;
      const s = toDate(start) / MS_DAY, e = toDate(end) / MS_DAY;
      const units = Math.max(1, Number(t.resourceUnits) || 1);
      const byDay = load.get(res) ?? new Map<number, string[]>();
      for (let d = s; d <= e; d++) {
        const arr = byDay.get(d) ?? [];
        for (let u = 0; u < units; u++) arr.push(t.id);
        byDay.set(d, arr);
      }
      load.set(res, byDay);
    }
    // Find the earliest over-capacity day; delay its latest-starting task by one day.
    let fixed = false;
    for (const [res, byDay] of load) {
      const cap = capacity[res];
      const days = [...byDay.keys()].sort((a, b) => a - b);
      for (const d of days) {
        const ids = [...new Set(byDay.get(d)!)];
        const used = byDay.get(d)!.length;
        if (used > cap && ids.length > 1) {
          // delay the task on this day that starts latest (least likely to be a predecessor)
          const victim = ids
            .map((id) => ({ id, start: sched.get(id)!.start }))
            .sort((a, b) => (a.start < b.start ? 1 : -1))[0];
          extraLag.set(victim.id, (extraLag.get(victim.id) ?? 0) + 1);
          fixed = true;
          break;
        }
      }
      if (fixed) break;
    }
    if (!fixed) break;
  }

  const finalSched = runForward();
  const finish = [...finalSched.values()].reduce((mx, v) => (toDate(v.end) > toDate(mx) ? v.end : mx), projectStart);
  const critical = markCritical(
    tasks.map((t) => ({ ...t, delayDays: (Number(t.delayDays) || 0) + (extraLag.get(t.id) ?? 0) })),
    finalSched,
    finish,
  );

  const planned: PlannedTask[] = tasks.map((t) => ({
    id: t.id,
    name: t.name,
    durationDays: dur(t),
    dependencies: t.dependencies ?? [],
    start: finalSched.get(t.id)!.start,
    end: finalSched.get(t.id)!.end,
    resource: t.resource ?? null,
    resourceUnits: Math.max(1, Number(t.resourceUnits) || 1),
    critical: critical.has(t.id),
  })).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  // Peak load per resource on the final plan.
  const peaks: SchedulePlan['resourcePeaks'] = [];
  const resources = new Set(tasks.map((t) => t.resource).filter((r): r is string => !!r));
  for (const res of resources) {
    const byDay = new Map<number, number>();
    for (const t of planned.filter((p) => p.resource === res)) {
      const s = toDate(t.start) / MS_DAY, e = toDate(t.end) / MS_DAY;
      for (let d = s; d <= e; d++) byDay.set(d, (byDay.get(d) ?? 0) + t.resourceUnits);
    }
    const peak = byDay.size ? Math.max(...byDay.values()) : 0;
    const cap = capacity[res] ?? Infinity;
    peaks.push({ resource: res, peakUnits: peak, capacity: Number.isFinite(cap) ? cap : 0, overallocated: peak > cap });
  }

  return {
    projectStart,
    projectFinish: finish,
    durationDays: dayCount(projectStart, finish) + 1,
    tasks: planned,
    criticalPath: planned.filter((t) => t.critical).map((t) => t.id),
    resourcePeaks: peaks,
  };
}
