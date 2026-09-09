import { describe, expect, it } from 'vitest';
import { makeProjectSchedule, setScheduleTasks, setBaseline, type NewScheduleTask } from './schedule';

/**
 * §22 Step 2A — a schedule task's identity is its id, and never its name.
 *
 * These matter more than the migration. The migration moves data once; these rules decide whether
 * the schedule can be trusted to remember what it committed to, every time anybody edits it.
 *
 * What was true before, and is asserted false here: `setScheduleTasks` rebuilt every task and
 * re-attached baselines through `Map<name, baseline>`. Two tasks called "Install CCTV" were one
 * key, and renaming a task dropped its baseline because the old key no longer resolved.
 */

const schedule = (tasks: NewScheduleTask[]) =>
  makeProjectSchedule({ tenantId: 't1', projectId: 'p1', tasks });

const task = (name: string, start = '2026-07-01', end = '2026-07-05'): NewScheduleTask =>
  ({ name, plannedStart: start, plannedEnd: end });

/** Round-trip the stored tasks back as edit input, the way a UI does. */
const asInput = (sch: ReturnType<typeof schedule>): NewScheduleTask[] =>
  sch.tasks.map((t) => ({
    id: t.id, name: t.name, plannedStart: t.plannedStart, plannedEnd: t.plannedEnd,
    actualStart: t.actualStart, actualEnd: t.actualEnd, percentComplete: t.percentComplete,
  }));

describe('identity', () => {
  it('gives every task a stable id', () => {
    const sch = schedule([task('Install CCTV'), task('Commission BMS')]);
    for (const t of sch.tasks) expect(t.id).toMatch(/[0-9a-f-]{8,}/i);
    expect(new Set(sch.tasks.map((t) => t.id)).size).toBe(2);
  });

  it('keeps two tasks with the SAME NAME distinct', () => {
    // The collision the old model could not express: one key, two tasks.
    const sch = schedule([task('Install CCTV'), task('Install CCTV')]);
    expect(sch.tasks).toHaveLength(2);
    expect(sch.tasks[0].id).not.toBe(sch.tasks[1].id);
  });

  it('preserves identity through a rename', () => {
    const sch = schedule([task('Install CCTV')]);
    const originalId = sch.tasks[0].id;
    const renamed = setScheduleTasks(sch, [{ ...asInput(sch)[0], name: 'CCTV Installation' }]);
    expect(renamed.tasks[0].id).toBe(originalId);
    expect(renamed.tasks[0].name).toBe('CCTV Installation');
  });

  it('preserves identity through a reorder', () => {
    const sch = schedule([task('A', '2026-07-01', '2026-07-02'), task('B', '2026-07-03', '2026-07-04')]);
    const ids = new Map(sch.tasks.map((t) => [t.name, t.id]));
    const reversed = setScheduleTasks(sch, [...asInput(sch)].reverse());
    for (const t of reversed.tasks) expect(t.id).toBe(ids.get(t.name));
  });

  it('gives a re-created task a NEW identity — a name does not resurrect it', () => {
    const sch = setBaseline(schedule([task('Install CCTV')]));
    const originalId = sch.tasks[0].id;
    expect(sch.tasks[0].baselineStart).toBe('2026-07-01');

    // Delete it, then add a task with the same name. That is a different task.
    const emptied = setScheduleTasks(sch, []);
    expect(emptied.tasks).toHaveLength(0);
    const recreated = setScheduleTasks(emptied, [task('Install CCTV')]);

    expect(recreated.tasks[0].id).not.toBe(originalId);
    // And it carries no baseline it never had. Name-based matching would have handed it one.
    expect(recreated.tasks[0].baselineStart).toBeNull();
  });
});

describe('baseline follows identity', () => {
  it('survives a rename', () => {
    const sch = setBaseline(schedule([task('Install CCTV', '2026-07-01', '2026-07-05')]));
    expect(sch.tasks[0].baselineStart).toBe('2026-07-01');

    const renamed = setScheduleTasks(sch, [
      { ...asInput(sch)[0], name: 'CCTV Installation', plannedStart: '2026-07-10', plannedEnd: '2026-07-14' },
    ]);
    // The commitment is still there, and the slippage is now visible — which is the whole point.
    expect(renamed.tasks[0]).toMatchObject({
      name: 'CCTV Installation', baselineStart: '2026-07-01', baselineEnd: '2026-07-05',
      plannedStart: '2026-07-10',
    });
  });

  it('does not let one task steal a same-named task\'s baseline', () => {
    const sch = setBaseline(schedule([
      task('Install CCTV', '2026-07-01', '2026-07-05'),
      task('Install CCTV', '2026-08-01', '2026-08-05'),
    ]));
    const [first, second] = sch.tasks;
    expect(first.baselineStart).toBe('2026-07-01');
    expect(second.baselineStart).toBe('2026-08-01');

    // Move both. Under name matching, both would come back with whichever baseline won the map.
    const moved = setScheduleTasks(sch, [
      { ...asInput(sch)[0], plannedStart: '2026-07-08', plannedEnd: '2026-07-12' },
      { ...asInput(sch)[1], plannedStart: '2026-08-08', plannedEnd: '2026-08-12' },
    ]);
    const byId = new Map(moved.tasks.map((t) => [t.id, t]));
    expect(byId.get(first.id)!.baselineStart).toBe('2026-07-01');
    expect(byId.get(second.id)!.baselineStart).toBe('2026-08-01');
  });

  it('drops the baseline only when the task itself is dropped', () => {
    const sch = setBaseline(schedule([task('Keep'), task('Drop', '2026-09-01', '2026-09-02')]));
    const keep = sch.tasks.find((t) => t.name === 'Keep')!;
    const after = setScheduleTasks(sch, [asInput(sch).find((t) => t.name === 'Keep')!]);
    expect(after.tasks).toHaveLength(1);
    expect(after.tasks[0].id).toBe(keep.id);
    expect(after.tasks[0].baselineStart).toBe(keep.baselineStart);
  });
});

describe('a caller that sends no ids is replacing, not editing', () => {
  it('mints fresh ids and carries no baselines across', () => {
    // Explicit rather than incidental: omitting ids is how a caller says "this is the new task
    // list". Silently matching by name to be helpful is exactly the defect being removed.
    const sch = setBaseline(schedule([task('Install CCTV')]));
    const replaced = setScheduleTasks(sch, [task('Install CCTV')]);
    expect(replaced.tasks[0].id).not.toBe(sch.tasks[0].id);
    expect(replaced.tasks[0].baselineStart).toBeNull();
  });
});

describe('ordering is stable and is not identity', () => {
  it('breaks ties by id so the same input always produces the same order', () => {
    const same = '2026-07-01';
    const a = schedule([task('B', same, same), task('A', same, same), task('C', same, same)]);
    const b = setScheduleTasks(a, asInput(a));
    expect(b.tasks.map((t) => t.id)).toEqual(a.tasks.map((t) => t.id));
  });
});
