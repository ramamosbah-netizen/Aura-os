import { describe, expect, it } from 'vitest';
import { findDependencyCycle, validateDependencies } from './schedule-network';
import { makeProjectSchedule, setScheduleDependencies, setScheduleTasks, type NewScheduleTask } from './schedule';
import { planSchedule, type PlanTaskInput } from './schedule-planning';

/**
 * §22 Step 2B — authored duration and first-class dependencies.
 *
 * Two rules run through all of it. A duration is AUTHORED and never inferred from planned dates,
 * because those are where a task currently sits rather than a decision about how long it takes. And
 * a dependency network is refused rather than repaired: an edge naming an unknown task is not an
 * instruction to create one, and a cycle is not broken by dropping an edge nobody chose.
 */

const task = (name: string, over: Partial<NewScheduleTask> = {}): NewScheduleTask =>
  ({ name, plannedStart: '2026-07-01', plannedEnd: '2026-07-05', ...over });

const schedule = (names: string[]) =>
  makeProjectSchedule({ tenantId: 't1', projectId: 'p1', tasks: names.map((n) => task(n)) });

describe('authored duration', () => {
  it('is null when nobody has stated one — never derived from the dates', () => {
    const sch = schedule(['Install CCTV']);
    // The task spans five calendar days. That is not a duration, and nothing pretends it is.
    expect(sch.tasks[0].plannedStart).toBe('2026-07-01');
    expect(sch.tasks[0].plannedEnd).toBe('2026-07-05');
    expect(sch.tasks[0].durationWorkingDays).toBeNull();
  });

  it('is kept when authored', () => {
    const sch = makeProjectSchedule({
      tenantId: 't1', projectId: 'p1', tasks: [task('Pull cables', { durationWorkingDays: 3 })],
    });
    expect(sch.tasks[0].durationWorkingDays).toBe(3);
  });

  it('refuses a duration that is not a whole number of working days, at least one', () => {
    const bad = (d: number) => () => makeProjectSchedule({
      tenantId: 't1', projectId: 'p1', tasks: [task('x', { durationWorkingDays: d })],
    });
    expect(bad(0)).toThrow(/at least 1/);
    expect(bad(-2)).toThrow(/at least 1/);
    expect(bad(1.5)).toThrow(/whole number/);
  });
});

describe('dependency validation refuses rather than repairs', () => {
  const ids = ['a', 'b', 'c'];

  it('accepts a well-formed network', () => {
    expect(validateDependencies(ids, [
      { predecessorTaskId: 'a', successorTaskId: 'b' },
      { predecessorTaskId: 'b', successorTaskId: 'c' },
    ])).toEqual({ ok: true });
  });

  it('refuses a self-dependency', () => {
    const v = validateDependencies(ids, [{ predecessorTaskId: 'a', successorTaskId: 'a' }]);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/cannot depend on itself/);
  });

  it('refuses an endpoint that is not a task in this schedule', () => {
    // Not a hint to create one. The caller named something that does not exist and is told so.
    expect(validateDependencies(ids, [{ predecessorTaskId: 'a', successorTaskId: 'ghost' }]).reason)
      .toMatch(/successor ghost is not a task in this schedule/);
    expect(validateDependencies(ids, [{ predecessorTaskId: 'ghost', successorTaskId: 'a' }]).reason)
      .toMatch(/predecessor ghost is not a task in this schedule/);
  });

  it('refuses a duplicate edge', () => {
    const v = validateDependencies(ids, [
      { predecessorTaskId: 'a', successorTaskId: 'b' },
      { predecessorTaskId: 'a', successorTaskId: 'b' },
    ]);
    expect(v.reason).toMatch(/duplicate dependency a → b/);
  });
});

describe('cycle detection names the loop', () => {
  it('finds a two-task cycle', () => {
    const cycle = findDependencyCycle([
      { predecessorTaskId: 'a', successorTaskId: 'b' },
      { predecessorTaskId: 'b', successorTaskId: 'a' },
    ]);
    expect(cycle).toEqual(['a', 'b', 'a']);
  });

  it('finds a longer cycle, and reports the path rather than just its existence', () => {
    // A bare "cycle detected" leaves someone reading a hundred-task network with nowhere to start.
    const cycle = findDependencyCycle([
      { predecessorTaskId: 'a', successorTaskId: 'b' },
      { predecessorTaskId: 'b', successorTaskId: 'c' },
      { predecessorTaskId: 'c', successorTaskId: 'a' },
    ]);
    expect(cycle).toEqual(['a', 'b', 'c', 'a']);
  });

  it('does not mistake a diamond for a cycle', () => {
    // a → b → d and a → c → d share endpoints without looping.
    expect(findDependencyCycle([
      { predecessorTaskId: 'a', successorTaskId: 'b' },
      { predecessorTaskId: 'a', successorTaskId: 'c' },
      { predecessorTaskId: 'b', successorTaskId: 'd' },
      { predecessorTaskId: 'c', successorTaskId: 'd' },
    ])).toBeNull();
  });

  it('is deterministic for a given edge set', () => {
    const edges = [
      { predecessorTaskId: 'z', successorTaskId: 'y' },
      { predecessorTaskId: 'y', successorTaskId: 'z' },
      { predecessorTaskId: 'a', successorTaskId: 'b' },
    ];
    expect(findDependencyCycle(edges)).toEqual(findDependencyCycle([...edges].reverse()));
  });
});

describe('the aggregate governs its own network', () => {
  it('rejects a cycle at the writer, naming the tasks that form it', () => {
    const sch = schedule(['A', 'B']);
    const [a, b] = sch.tasks;
    expect(() => setScheduleDependencies(sch, [
      { predecessorTaskId: a.id, successorTaskId: b.id },
      { predecessorTaskId: b.id, successorTaskId: a.id },
    ])).toThrow(/cycle: .* → .* → /);
  });

  it('drops edges whose endpoint was deleted, so a save means one thing on both paths', () => {
    // The database cascades on the same condition. If the aggregate did not, an in-memory save and
    // a Postgres save would disagree about what happened.
    const sch = schedule(['A', 'B']);
    const [a, b] = sch.tasks;
    const linked = setScheduleDependencies(sch, [{ predecessorTaskId: a.id, successorTaskId: b.id }]);
    expect(linked.dependencies).toHaveLength(1);

    const withoutB = setScheduleTasks(linked, [{
      id: a.id, name: a.name, plannedStart: a.plannedStart, plannedEnd: a.plannedEnd,
    }]);
    expect(withoutB.tasks).toHaveLength(1);
    expect(withoutB.dependencies).toHaveLength(0);
  });

  it('keeps edges when the tasks survive a rename', () => {
    const sch = schedule(['A', 'B']);
    const [a, b] = sch.tasks;
    const linked = setScheduleDependencies(sch, [{ predecessorTaskId: a.id, successorTaskId: b.id }]);
    const renamed = setScheduleTasks(linked, linked.tasks.map((t) => ({ ...t, name: `${t.name} (revised)` })));
    expect(renamed.dependencies).toHaveLength(1);
    expect(renamed.dependencies[0]).toMatchObject({ predecessorTaskId: a.id, successorTaskId: b.id });
  });
});

describe('the planner reports a missing duration rather than inventing one', () => {
  const t = (id: string, duration: number | null, deps?: string[]): PlanTaskInput =>
    ({ id, name: id, durationWorkingDays: duration, dependencies: deps });

  it('cannot place a task with no authored duration, and says which', () => {
    const p = planSchedule({ projectStart: '2026-07-01', tasks: [t('a', 2), t('b', null)] });

    const b = p.tasks.find((x) => x.id === 'b')!;
    expect(b.scheduled).toBe(false);
    // Null dates, not fabricated ones. The previous engine substituted a 1-day duration here.
    expect(b.start).toBeNull();
    expect(b.end).toBeNull();

    expect(p.planningDeficiencies).toEqual([
      expect.objectContaining({ taskId: 'b', reason: 'DURATION_NOT_AUTHORED' }),
    ]);
    // An incomplete plan is not a clean one.
    expect(p.coverage).toBe('PARTIAL');
    expect(p.established).toBe(false);
  });

  it('cascades to everything waiting on it', () => {
    // A successor of an unplaceable task has no earliest start; giving it one anyway would put a
    // date on screen that nothing supports.
    const p = planSchedule({
      projectStart: '2026-07-01',
      tasks: [t('a', null), t('b', 2, ['a']), t('c', 2, ['b'])],
    });
    expect(p.tasks.every((x) => !x.scheduled)).toBe(true);
    expect(p.planningDeficiencies.map((d) => `${d.taskId}:${d.reason}`)).toEqual([
      'a:DURATION_NOT_AUTHORED', 'b:BLOCKED_BY_UNSCHEDULABLE', 'c:BLOCKED_BY_UNSCHEDULABLE',
    ]);
  });

  it('still places the tasks it can, and keeps the unplaceable ones visible', () => {
    const p = planSchedule({
      projectStart: '2026-07-01',
      tasks: [t('placeable', 2), t('orphan', null)],
    });
    expect(p.tasks.find((x) => x.id === 'placeable')?.start).toBe('2026-07-01');
    // Present in the list rather than filtered out — an absent task reads as no task at all.
    expect(p.tasks.map((x) => x.id)).toContain('orphan');
    expect(p.tasks[p.tasks.length - 1].id).toBe('orphan');
  });

  it('reports a fully authored plan as complete', () => {
    const p = planSchedule({ projectStart: '2026-07-01', tasks: [t('a', 2), t('b', 1, ['a'])] });
    expect(p.planningDeficiencies).toEqual([]);
    expect(p.coverage).toBe('COMPLETE');
    expect(p.established).toBe(true);
  });
});
