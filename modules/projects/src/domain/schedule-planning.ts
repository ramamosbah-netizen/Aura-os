/**
 * Schedule planning engine — framework-free, PURE, and deliberately ignorant of where facts come
 * from (§22 Design Gate §5.1).
 *
 *  1. **Reactive rescheduling (CPM forward pass):** finish-to-start dependencies with optional lag,
 *     over a working calendar supplied as data.
 *  2. **Resource levelling:** delay tasks, in dependency order, until no resource exceeds its daily
 *     capacity — counting commitments made by OTHER projects, which the caller resolves in.
 *
 * WHAT THIS ENGINE MUST NEVER DO. It must not query HR, Fleet, Assets, calendars or other projects.
 * A Capacity/Availability Resolver does that and hands `PlanInput` a set of resolved facts; this
 * function turns them into a proposal and nothing else. Keeping it pure is what makes it
 * deterministic and testable, and what stops a planning engine growing a data layer.
 *
 * WHAT CHANGED, AND WHY IT HAD TO. The previous version reported `{ capacity: 0, overallocated:
 * false }` whenever capacity was unknown — which was always, since nothing stored capacity. Zero
 * capacity and "not overallocated" in the same breath is an unanswerable question dressed as a
 * clean answer, and a plan built on it says "available" about a crane already booked on another
 * site. So a resource that cannot be judged reports `UNKNOWN`, and the plan carries TWO independent
 * axes — `feasibility` (is anything judged in conflict) and `coverage` (was everything judged) —
 * with `established` as the only combination a screen may present as "resourced".
 *
 * Dates are YYYY-MM-DD; durations are whole WORKING days (a 1-day task starts and finishes on the
 * same working day).
 */

// ── Resource identity (DG-22.2) ────────────────────────────────────────────

export type ResourceType = 'employee' | 'vehicle' | 'asset' | 'pool';

/**
 * A typed reference to a resource in its OWNING register.
 *
 * Typed because equality decides whether two projects are fighting over the same crane. Comparing
 * bare ids would make a vehicle and an asset that happen to share a uuid indistinguishable, and
 * comparing names would make `TC-01` and `Tower Crane TC-01` two cranes that conflict with nothing.
 *
 * Never carries a name, a plate or a serial: those live in the owning register and are read through
 * at display time, so nothing here can drift out of date.
 */
export interface ResourceRef {
  resourceType: ResourceType;
  canonicalResourceId: string;
}

export const sameResource = (a: ResourceRef, b: ResourceRef): boolean =>
  a.resourceType === b.resourceType && a.canonicalResourceId === b.canonicalResourceId;

/** Stable map key for a reference. Internal — equality is `sameResource`, not string comparison. */
const key = (r: ResourceRef): string => `${r.resourceType}:${r.canonicalResourceId}`;

/** What a quantity counts. Quantities of different units are never summed or compared. */
export type ResourceUnit = 'hours' | 'persons' | 'crews' | 'units';

// ── Tri-state feasibility (Design Gate §2) ─────────────────────────────────

/**
 * One resource's verdict. `UNKNOWN` is not a degraded `AVAILABLE` — it says the question could not
 * be answered about this resource, and it is what drags the plan's coverage to PARTIAL.
 */
export type ResourceFeasibility = 'AVAILABLE' | 'CONFLICTED' | 'UNKNOWN';

/**
 * The plan's verdict. Deliberately only two values.
 *
 * Not-knowing is carried by `coverage`, not smuggled into this axis — the §24 rule, applied here:
 * a roll-up that had to express "conflicted" and "unassessed" in one value would let either
 * swallow the other. So `AVAILABLE` here means "nothing that could be judged is in conflict", and
 * says nothing at all about how much could be judged.
 *
 * Which is why `AVAILABLE` alone must never be presented as availability — see `established`.
 */
export type PlanFeasibility = 'AVAILABLE' | 'CONFLICTED';

/**
 * Whether every resource could be judged — the second axis, borrowed from §24 for the same reason.
 *
 * A single roll-up cannot carry both "something is over capacity" and "something could not be
 * assessed": the worse of the two swallows the other, and the unassessed resources disappear behind
 * a finding. So severity and coverage stay independent here as they do in project health.
 */
export type FeasibilityCoverage = 'COMPLETE' | 'PARTIAL';

// ── Inputs ────────────────────────────────────────────────────────────────

/** What a task needs. DEMAND — never a commitment, and never an assignment. */
export interface PlanRequirement {
  resource: ResourceRef;
  quantity: number;
  unit: ResourceUnit;
}

/**
 * Capacity as resolved by the caller.
 *
 * `quantity: null` means UNKNOWN and is the honest answer when nothing has declared a capacity. It
 * is deliberately not `0` (a real, different fact: none available) and not `Infinity` (which is how
 * the previous version manufactured "available").
 */
export interface ResolvedCapacity {
  resource: ResourceRef;
  unit: ResourceUnit;
  quantity: number | null;
}

/**
 * A claim on the same resource held by another project, resolved in by the caller.
 *
 * This is how contract requirement #4 is satisfied without the engine querying anything: the
 * cross-project fact arrives as data. Without it, two projects each see a free crane.
 */
export interface ExternalCommitment {
  resource: ResourceRef;
  unit: ResourceUnit;
  quantity: number;
  /** Inclusive date range. */
  from: string;
  to: string;
  /** Who holds it — for the conflict report, never for the arithmetic. */
  projectId?: string | null;
}

export interface PlanTaskInput {
  id: string;
  name: string;
  durationDays: number;
  /** Finish-to-start predecessors by task id. */
  dependencies?: string[];
  /** Lag (working days) applied after the latest predecessor finish. */
  lagDays?: number;
  /**
   * What the task needs. Several, because a real task needs a crew AND a crane, and the previous
   * single `resource?: string` made that inexpressible.
   */
  requirements?: PlanRequirement[];
  /** Levelling delay (working days) applied to the computed start, regardless of dependencies. */
  delayDays?: number;
}

export interface PlanInput {
  tasks: PlanTaskInput[];
  projectStart: string;
  /** Resolved capacities. A resource absent from this list is UNKNOWN, not unlimited. */
  capacities?: ResolvedCapacity[];
  /** Commitments held by other projects on the same resources. */
  externalCommitments?: ExternalCommitment[];
  /**
   * Non-working dates (YYYY-MM-DD), resolved from the kernel calendar by the caller.
   *
   * Supplied as data so the engine consumes a calendar without importing one — contract #5 without
   * breaking §5.1. Empty means every day works, which is a caller's assertion, not this engine's.
   */
  nonWorkingDays?: readonly string[];
}

// ── Outputs ───────────────────────────────────────────────────────────────

export interface PlannedTask {
  id: string;
  name: string;
  durationDays: number;
  dependencies: string[];
  start: string;
  end: string;
  requirements: PlanRequirement[];
  /** True when the task has zero total float (drives project finish). */
  critical: boolean;
}

export interface ResourceVerdict {
  resource: ResourceRef;
  unit: ResourceUnit;
  /** This project's peak daily demand on the levelled plan. */
  peakDemand: number;
  /** Peak including commitments held by other projects. */
  peakTotalDemand: number;
  /** `null` when unknown — never 0-for-unknown. */
  capacity: number | null;
  feasibility: ResourceFeasibility;
  /** Present when the verdict is not AVAILABLE, in the engine's own words. */
  reason?: string;
  /** The days on which total demand exceeded a known capacity. */
  conflictDays: string[];
}

/** Demand that cannot be met by levelling, and therefore must be reported rather than delayed. */
export interface UnmetDemand {
  taskId: string;
  resource: ResourceRef;
  required: number;
  capacity: number | null;
  reason: 'EXCEEDS_CAPACITY' | 'UNIT_MISMATCH' | 'UNKNOWN_CAPACITY';
  detail: string;
}

export interface SchedulePlan {
  projectStart: string;
  projectFinish: string;
  durationDays: number;
  tasks: PlannedTask[];
  criticalPath: string[];
  resourceVerdicts: ResourceVerdict[];
  unmetDemand: UnmetDemand[];
  /** Whether anything that COULD be judged is in conflict. Says nothing about how much was. */
  feasibility: PlanFeasibility;
  /** PARTIAL when any resource could not be judged. Independent of `feasibility`. */
  coverage: FeasibilityCoverage;
  /**
   * The ONE combination a screen may present as "resourced": nothing in conflict, and nothing
   * left unjudged.
   *
   * Exists so the rule lives in the domain rather than being re-derived by every consumer — the
   * same reason §24 puts `reassuring` on its payload. `AVAILABLE` + `PARTIAL` is not availability;
   * it is not established, and a caller that reads `feasibility` alone would call it available.
   */
  established: boolean;
}

// ── Date arithmetic over a working calendar ───────────────────────────────

const MS_DAY = 86_400_000;
const toDate = (s: string): number => Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
const fromDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const addCalendarDays = (s: string, n: number): string => fromDate(toDate(s) + n * MS_DAY);

/** Guard against a caller marking every day non-working, which would otherwise loop forever. */
const MAX_SKIP = 3660;

function makeCalendar(nonWorking: readonly string[] = []) {
  const off = new Set(nonWorking.map((d) => d.slice(0, 10)));
  const isWorking = (d: string): boolean => !off.has(d);
  /** The first working day on or after `d`. */
  const nextWorking = (d: string): string => {
    let cur = d;
    for (let i = 0; i < MAX_SKIP && !isWorking(cur); i++) cur = addCalendarDays(cur, 1);
    return cur;
  };
  /** Advance `n` WORKING days beyond `d` (n=0 → the first working day on or after d). */
  const advance = (d: string, n: number): string => {
    let cur = nextWorking(d);
    for (let i = 0; i < n; i++) cur = nextWorking(addCalendarDays(cur, 1));
    return cur;
  };
  /** The working dates a task occupies, given its start and whole-working-day duration. */
  const span = (start: string, durationDays: number): string[] => {
    const days: string[] = [];
    let cur = nextWorking(start);
    for (let i = 0; i < Math.max(1, durationDays); i++) {
      days.push(cur);
      cur = nextWorking(addCalendarDays(cur, 1));
    }
    return days;
  };
  return { isWorking, nextWorking, advance, span };
}

type Calendar = ReturnType<typeof makeCalendar>;

// ── CPM forward pass ──────────────────────────────────────────────────────

/** Topological order over finish-to-start deps; throws on a cycle. */
function topoOrder(tasks: PlanTaskInput[]): PlanTaskInput[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map<string, 0 | 1 | 2>();
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
  // Sorted, so the order is deterministic for tasks with no dependency relationship (contract #8).
  for (const t of [...tasks].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) visit(t.id, []);
  return out;
}

const dur = (t: PlanTaskInput): number => Math.max(1, Math.floor(Number(t.durationDays) || 1));

/**
 * Forward pass: each task starts on the first working day after its latest predecessor finishes,
 * plus any lag and levelling delay.
 */
export function reschedule(
  tasks: PlanTaskInput[],
  projectStart: string,
  nonWorkingDays: readonly string[] = [],
): Map<string, { start: string; end: string }> {
  const cal = makeCalendar(nonWorkingDays);
  const ordered = topoOrder(tasks);
  const out = new Map<string, { start: string; end: string }>();
  for (const t of ordered) {
    let earliest = cal.nextWorking(projectStart);
    for (const dep of t.dependencies ?? []) {
      const d = out.get(dep);
      if (d && toDate(d.end) >= toDate(earliest)) earliest = cal.advance(d.end, 1);
    }
    const lag = Math.max(0, Math.floor(Number(t.lagDays) || 0));
    const delay = Math.max(0, Math.floor(Number(t.delayDays) || 0));
    const start = cal.advance(earliest, lag + delay);
    const days = cal.span(start, dur(t));
    out.set(t.id, { start: days[0], end: days[days.length - 1] });
  }
  return out;
}

/** Tasks with zero total float — those whose finish equals the project finish, walked backwards. */
function markCritical(
  tasks: PlanTaskInput[],
  sched: Map<string, { start: string; end: string }>,
  finish: string,
): Set<string> {
  const critical = new Set<string>();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const queue = tasks.filter((t) => sched.get(t.id)?.end === finish).map((t) => t.id);
  while (queue.length) {
    const id = queue.shift()!;
    if (critical.has(id)) continue;
    critical.add(id);
    const t = byId.get(id);
    for (const dep of t?.dependencies ?? []) {
      const d = sched.get(dep);
      const self = sched.get(id);
      // A predecessor is critical when it finishes immediately before this task starts.
      if (d && self && toDate(d.end) < toDate(self.start)) queue.push(dep);
    }
  }
  return critical;
}

// ── The plan ──────────────────────────────────────────────────────────────

const requirementsOf = (t: PlanTaskInput): PlanRequirement[] =>
  (t.requirements ?? []).filter((r) => r?.resource?.canonicalResourceId && Number(r.quantity) > 0);

interface CapacityEntry { unit: ResourceUnit; quantity: number | null }

/** Daily demand per resource across the project's own tasks. */
function dailyDemand(
  tasks: PlanTaskInput[],
  sched: Map<string, { start: string; end: string }>,
  cal: Calendar,
): Map<string, Map<string, number>> {
  const load = new Map<string, Map<string, number>>();
  for (const t of tasks) {
    const s = sched.get(t.id);
    if (!s) continue;
    const days = cal.span(s.start, dur(t));
    for (const req of requirementsOf(t)) {
      const k = key(req.resource);
      const byDay = load.get(k) ?? new Map<string, number>();
      for (const d of days) byDay.set(d, (byDay.get(d) ?? 0) + Number(req.quantity));
      load.set(k, byDay);
    }
  }
  return load;
}

/**
 * Compute a resource-levelled, dependency-driven plan.
 *
 * Levelling delays tasks until no resource exceeds a KNOWN capacity. A resource whose capacity is
 * unknown is not levelled against — and, crucially, is reported as `UNKNOWN` rather than passed
 * over in silence. That silence was the previous version's defect.
 */
export function planSchedule(input: PlanInput): SchedulePlan {
  const { tasks, projectStart } = input;
  const cal = makeCalendar(input.nonWorkingDays ?? []);

  if (tasks.length === 0) {
    return {
      projectStart, projectFinish: projectStart, durationDays: 0, tasks: [], criticalPath: [],
      resourceVerdicts: [], unmetDemand: [],
      feasibility: 'AVAILABLE', coverage: 'COMPLETE', established: true,
    };
  }

  // Resolved capacity, by typed reference.
  const capacity = new Map<string, CapacityEntry>();
  for (const c of input.capacities ?? []) {
    capacity.set(key(c.resource), { unit: c.unit, quantity: c.quantity });
  }

  // Commitments held elsewhere, expanded to a per-day figure per resource.
  const external = new Map<string, Map<string, number>>();
  for (const c of input.externalCommitments ?? []) {
    const k = key(c.resource);
    const byDay = external.get(k) ?? new Map<string, number>();
    for (let d = c.from.slice(0, 10); toDate(d) <= toDate(c.to.slice(0, 10)); d = addCalendarDays(d, 1)) {
      if (cal.isWorking(d)) byDay.set(d, (byDay.get(d) ?? 0) + Number(c.quantity));
    }
    external.set(k, byDay);
  }

  const unmet: UnmetDemand[] = [];

  // Requirements whose unit disagrees with the resolved capacity are REFUSED, not converted — that
  // is how "4 persons" silently becomes "4 hours". They take no part in levelling.
  const mismatched = new Set<string>();
  for (const t of tasks) {
    for (const req of requirementsOf(t)) {
      const cap = capacity.get(key(req.resource));
      if (cap && cap.unit !== req.unit) {
        mismatched.add(key(req.resource));
        unmet.push({
          taskId: t.id, resource: req.resource, required: req.quantity, capacity: cap.quantity,
          reason: 'UNIT_MISMATCH',
          detail: `task requires ${req.quantity} ${req.unit}; capacity is declared in ${cap.unit}. Units are never converted implicitly.`,
        });
      }
    }
  }

  /** Levellable ⇔ a known capacity exists and the units agree. */
  const levellable = (k: string): number | null => {
    if (mismatched.has(k)) return null;
    const cap = capacity.get(k);
    return cap && cap.quantity !== null ? cap.quantity : null;
  };

  const extraLag = new Map<string, number>();
  const runForward = (): Map<string, { start: string; end: string }> =>
    reschedule(
      tasks.map((t) => ({ ...t, delayDays: (Number(t.delayDays) || 0) + (extraLag.get(t.id) ?? 0) })),
      projectStart,
      input.nonWorkingDays ?? [],
    );

  // Iteratively resolve over-allocations. Bounded, so a pathological input terminates.
  for (let pass = 0; pass < tasks.length * 366; pass++) {
    const sched = runForward();
    const load = dailyDemand(tasks, sched, cal);
    let moved = false;

    // Deterministic: resources in key order, days in date order (contract #8).
    for (const k of [...load.keys()].sort()) {
      const cap = levellable(k);
      if (cap === null) continue; // unknown or mismatched — reported, never levelled against
      const byDay = load.get(k)!;
      const ext = external.get(k);
      for (const d of [...byDay.keys()].sort()) {
        const total = byDay.get(d)! + (ext?.get(d) ?? 0);
        if (total <= cap) continue;
        // Candidates: tasks active on this day that need this resource.
        const active = tasks
          .filter((t) => requirementsOf(t).some((r) => key(r.resource) === k))
          .filter((t) => cal.span(sched.get(t.id)!.start, dur(t)).includes(d));
        if (active.length < 2) break; // one task alone over capacity — reportable, not levellable
        // Delay the latest-starting task; ties broken by id so the result is deterministic.
        const victim = [...active].sort((a, b) => {
          const sa = sched.get(a.id)!.start, sb = sched.get(b.id)!.start;
          return sa === sb ? (a.id < b.id ? 1 : -1) : (sa < sb ? 1 : -1);
        })[0];
        extraLag.set(victim.id, (extraLag.get(victim.id) ?? 0) + 1);
        moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) break;
  }

  const finalSched = runForward();
  const finish = [...finalSched.values()].reduce(
    (mx, v) => (toDate(v.end) > toDate(mx) ? v.end : mx), projectStart,
  );
  const critical = markCritical(
    tasks.map((t) => ({ ...t, delayDays: (Number(t.delayDays) || 0) + (extraLag.get(t.id) ?? 0) })),
    finalSched, finish,
  );

  const planned: PlannedTask[] = tasks
    .map((t) => ({
      id: t.id,
      name: t.name,
      durationDays: dur(t),
      dependencies: t.dependencies ?? [],
      start: finalSched.get(t.id)!.start,
      end: finalSched.get(t.id)!.end,
      requirements: requirementsOf(t),
      critical: critical.has(t.id),
    }))
    .sort((a, b) => (a.start === b.start ? (a.id < b.id ? -1 : 1) : a.start < b.start ? -1 : 1));

  // ── Verdicts ────────────────────────────────────────────────────────────
  const finalLoad = dailyDemand(tasks, finalSched, cal);
  const refByKey = new Map<string, { ref: ResourceRef; unit: ResourceUnit }>();
  for (const t of tasks) {
    for (const r of requirementsOf(t)) refByKey.set(key(r.resource), { ref: r.resource, unit: r.unit });
  }

  const verdicts: ResourceVerdict[] = [];
  for (const k of [...refByKey.keys()].sort()) {
    const { ref, unit } = refByKey.get(k)!;
    const byDay = finalLoad.get(k) ?? new Map<string, number>();
    const ext = external.get(k);
    const allDays = new Set([...byDay.keys(), ...(ext ? ext.keys() : [])]);

    let peakDemand = 0, peakTotal = 0;
    const conflictDays: string[] = [];
    const cap = capacity.get(k);
    const known = !mismatched.has(k) && cap && cap.quantity !== null ? cap.quantity : null;

    for (const d of [...allDays].sort()) {
      const own = byDay.get(d) ?? 0;
      const total = own + (ext?.get(d) ?? 0);
      if (own > peakDemand) peakDemand = own;
      if (total > peakTotal) peakTotal = total;
      if (known !== null && total > known) conflictDays.push(d);
    }

    let feasibility: ResourceFeasibility;
    let reason: string | undefined;
    if (mismatched.has(k)) {
      feasibility = 'UNKNOWN';
      reason = `demand and capacity are expressed in different units, so they cannot be compared.`;
    } else if (!cap) {
      feasibility = 'UNKNOWN';
      reason = `no capacity has been declared for this resource, so whether it is available cannot be established.`;
    } else if (cap.quantity === null) {
      feasibility = 'UNKNOWN';
      reason = `capacity for this resource is unknown.`;
    } else if (conflictDays.length > 0) {
      feasibility = 'CONFLICTED';
      reason = ext && [...ext.values()].some((v) => v > 0)
        ? `peak demand ${peakTotal} ${unit} exceeds capacity ${cap.quantity} on ${conflictDays.length} day(s), including commitments held by other projects.`
        : `peak demand ${peakTotal} ${unit} exceeds capacity ${cap.quantity} on ${conflictDays.length} day(s).`;
    } else {
      feasibility = 'AVAILABLE';
    }

    verdicts.push({
      resource: ref, unit, peakDemand, peakTotalDemand: peakTotal,
      capacity: known, feasibility, ...(reason ? { reason } : {}), conflictDays,
    });

    // A single requirement larger than the whole capacity can never be levelled away — delaying it
    // for ever is not a solution, so it is reported as unmet.
    if (known !== null) {
      for (const t of tasks) {
        for (const req of requirementsOf(t)) {
          if (key(req.resource) === k && req.quantity > known) {
            unmet.push({
              taskId: t.id, resource: ref, required: req.quantity, capacity: known,
              reason: 'EXCEEDS_CAPACITY',
              detail: `task requires ${req.quantity} ${unit} but total capacity is ${known}. No amount of delay resolves this.`,
            });
          }
        }
      }
    } else {
      for (const t of tasks) {
        for (const req of requirementsOf(t)) {
          if (key(req.resource) === k && !mismatched.has(k)) {
            unmet.push({
              taskId: t.id, resource: ref, required: req.quantity, capacity: null,
              reason: 'UNKNOWN_CAPACITY',
              detail: `capacity is unknown, so this requirement cannot be shown to be satisfiable.`,
            });
          }
        }
      }
    }
  }

  // Two independent axes, for the reason §24 established: a known conflict must not swallow the
  // resources nobody could judge, and an unjudged resource must never read as available.
  const anyConflict = verdicts.some((v) => v.feasibility === 'CONFLICTED');
  const anyUnknown = verdicts.some((v) => v.feasibility === 'UNKNOWN');

  return {
    projectStart,
    projectFinish: finish,
    // Working days, not calendar days: a plan spanning a weekend did not take longer to do.
    durationDays: workingDaysBetween(cal, projectStart, finish),
    tasks: planned,
    criticalPath: planned.filter((t) => t.critical).map((t) => t.id),
    resourceVerdicts: verdicts,
    unmetDemand: unmet,
    feasibility: anyConflict ? 'CONFLICTED' : 'AVAILABLE',
    coverage: anyUnknown ? 'PARTIAL' : 'COMPLETE',
    established: !anyConflict && !anyUnknown,
  };
}

/** Inclusive count of working days between two dates. */
function workingDaysBetween(cal: Calendar, from: string, to: string): number {
  let n = 0;
  for (let d = from.slice(0, 10); toDate(d) <= toDate(to.slice(0, 10)); d = addCalendarDays(d, 1)) {
    if (cal.isWorking(d)) n++;
  }
  return n;
}
