import { describe, it, expect } from 'vitest';
import { assertDurationFitsWindow, makeProjectSchedule, setBaseline, setScheduleTasks, summariseSchedule } from './schedule';

const base = { tenantId: 't1', projectId: 'p1', projectName: 'Marina' };
const tasks = [
  { name: 'Mobilise', plannedStart: '2026-01-01', plannedEnd: '2026-01-10', percentComplete: 100 },
  { name: 'Cabling', plannedStart: '2026-01-11', plannedEnd: '2026-01-30', percentComplete: 50 },
  { name: 'Commission', plannedStart: '2026-02-01', plannedEnd: '2026-02-10', percentComplete: 0 },
];

describe('project schedule domain', () => {
  it('sorts tasks, validates dates + percent', () => {
    const s = makeProjectSchedule({ ...base, tasks });
    expect(s.tasks[0].name).toBe('Mobilise');
    expect(() => makeProjectSchedule({ ...base, tasks: [{ name: 'x', plannedStart: '2026-02-01', plannedEnd: '2026-01-01' }] })).toThrow('on/after');
    expect(() => makeProjectSchedule({ ...base, tasks: [{ name: 'x', plannedStart: '2026-01-01', plannedEnd: '2026-01-02', percentComplete: 150 }] })).toThrow('0..100');
  });

  it('summary: span, duration-weighted % complete, no variance pre-baseline', () => {
    const sm = summariseSchedule(makeProjectSchedule({ ...base, tasks }));
    expect(sm.plannedStart).toBe('2026-01-01');
    expect(sm.plannedEnd).toBe('2026-02-10');
    expect(sm.baselineSet).toBe(false);
    expect(sm.scheduleVarianceDays).toBe(0);
    expect(sm.percentComplete).toBeGreaterThan(0);
  });

  it('baseline snapshots planned; slipping a task shows positive variance', () => {
    let s = setBaseline(makeProjectSchedule({ ...base, tasks })).schedule;
    expect(s.baselineSetAt).not.toBeNull();
    expect(summariseSchedule(s).scheduleVarianceDays).toBe(0);
    // Slip commissioning by 5 days. The task ids are round-tripped, which is what makes this an
    // EDIT — baselines follow identity now, not the name. (Before §22 Step 2A this matched on
    // `t.name`, so renaming a task silently lost its baseline and two same-named tasks collided.)
    s = setScheduleTasks(s, s.tasks.map((t) => (t.name === 'Commission' ? { ...t, plannedEnd: '2026-02-15' } : t)));
    expect(summariseSchedule(s).scheduleVarianceDays).toBe(5);
  });
});

describe('work that cannot fit the window it was given', () => {
  const activity = (durationWorkingDays: number | null) => ({
    name: 'Riser containment', plannedStart: '2026-09-01', plannedEnd: '2026-09-20', durationWorkingDays,
  });

  it('returns the float, because float is a plan and not an error', () => {
    // Ten working days of work in a window holding fourteen: four days of slack, which is what a
    // look-ahead is built on. Forcing the two numbers equal would delete the concept.
    expect(assertDurationFitsWindow(activity(10), 14)).toBe(4);
    expect(assertDurationFitsWindow(activity(14), 14)).toBe(0);
  });

  it('refuses the impossible direction, naming both figures', () => {
    expect(() => assertDurationFitsWindow(activity(15), 12))
      .toThrow(/15 working days of work cannot fit a window that holds 12/);
  });

  it('says nothing about an activity whose duration was never authored', () => {
    // Not a duration of zero — nobody stated one, so there is nothing to fit.
    expect(assertDurationFitsWindow(activity(null), 14)).toBeNull();
  });
});

describe('taking a baseline, and replacing one', () => {
  const plan = () => makeProjectSchedule({
    tenantId: 't1', projectId: 'p1',
    tasks: [{ name: 'Containment', plannedStart: '2026-03-09', plannedEnd: '2026-03-12' }],
  });

  it('freezes today’s dates and records who took it, as revision 0', () => {
    const { schedule, revision } = setBaseline(plan(), { actorId: 'u-pm' });
    expect(schedule.tasks[0]).toMatchObject({ baselineStart: '2026-03-09', baselineEnd: '2026-03-12' });
    expect(schedule).toMatchObject({ baselineSetBy: 'u-pm', baselineRevision: 0 });
    // The first baseline needs no justification; there is nothing being replaced.
    expect(revision).toMatchObject({ revision: 0, setBy: 'u-pm', reason: null });
    expect(revision.tasks[0]).toMatchObject({ name: 'Containment', start: '2026-03-09', end: '2026-03-12' });
  });

  it('refuses to replace a baseline without a reason', () => {
    // The whole guard. Every variance figure on the project is measured against this: accept a
    // recovery, re-baseline silently, and the delay it was answering is now measured against the
    // dates the recovery produced.
    const { schedule } = setBaseline(plan(), { actorId: 'u-pm' });
    expect(() => setBaseline(schedule, { actorId: 'u-pm' })).toThrow(/requires a reason/);
    expect(() => setBaseline(schedule, { actorId: 'u-pm', reason: '   ' })).toThrow(/requires a reason/);
  });

  it('adds a revision rather than destroying one, and the old dates travel with it', () => {
    const first = setBaseline(plan(), { actorId: 'u-pm' });
    const moved = setScheduleTasks(first.schedule, first.schedule.tasks.map((task) => ({
      ...task, plannedStart: '2026-03-16', plannedEnd: '2026-03-19',
    })));
    const second = setBaseline(moved, { actorId: 'u-pm', reason: 'recovery accepted after the storm' });

    expect(second.schedule.baselineRevision).toBe(1);
    expect(second.revision).toMatchObject({ revision: 1, reason: 'recovery accepted after the storm' });
    expect(second.revision.tasks[0]).toMatchObject({ start: '2026-03-16', end: '2026-03-19' });
    // …and revision 0 still says what was originally committed to, which is what keeps a variance
    // against the original computable after the re-baseline.
    expect(first.revision.tasks[0]).toMatchObject({ start: '2026-03-09', end: '2026-03-12' });
  });

  it('refuses to baseline a programme with no activities in it', () => {
    expect(() => setBaseline(makeProjectSchedule({ tenantId: 't1', projectId: 'p1' }))).toThrow(/empty schedule/);
  });

  it('keeps the baseline through a later edit — the point of having one', () => {
    const { schedule } = setBaseline(plan(), { actorId: 'u-pm' });
    const slipped = setScheduleTasks(schedule, schedule.tasks.map((task) => ({ ...task, plannedEnd: '2026-03-20' })));
    expect(slipped.tasks[0]).toMatchObject({ baselineStart: '2026-03-09', baselineEnd: '2026-03-12', plannedEnd: '2026-03-20' });
  });
});
