import { describe, expect, it } from 'vitest';
import { makeProjectSchedule, setScheduleTasks, type NewScheduleTask } from './schedule';
import type { ResourceRef } from './resource-ref';

/**
 * §22 Step 5 — a task's demand.
 *
 * The rule these protect is one of the gate's three prohibited false confidences:
 *
 *     Missing requirement  ≠  Zero demand
 *
 * So a malformed requirement is refused loudly rather than dropped quietly. A requirement silently
 * discarded is demand the plan will never mention again, and every verdict about that resource
 * would then be correct about a question nobody asked.
 */

const pool = (id: string): ResourceRef => ({ resourceType: 'pool', canonicalResourceId: id });
const asset = (id: string): ResourceRef => ({ resourceType: 'asset', canonicalResourceId: id });

const task = (over: Partial<NewScheduleTask> = {}): NewScheduleTask =>
  ({ name: 'Pull cables', plannedStart: '2026-07-01', plannedEnd: '2026-07-05', ...over });

const schedule = (tasks: NewScheduleTask[]) =>
  makeProjectSchedule({ tenantId: 't1', projectId: 'p1', tasks });

describe('a task may need several resources', () => {
  it('holds a crew AND a rigger AND a crane on one task', () => {
    // The shape the old single `resource?: string` could not express, and the reason DG-22.1 makes
    // multiple requirements mandatory rather than optional.
    const sch = schedule([task({
      requirements: [
        { resource: pool('elv-tech'), quantity: 4, unit: 'persons' },
        { resource: pool('rigger'), quantity: 2, unit: 'persons' },
        { resource: asset('CR-01'), quantity: 1, unit: 'units' },
      ],
    })]);
    expect(sch.tasks[0].requirements).toHaveLength(3);
    expect(sch.tasks[0].requirements.map((r) => r.resource.canonicalResourceId).sort())
      .toEqual(['CR-01', 'elv-tech', 'rigger']);
  });

  it('gives every requirement its own identity', () => {
    const sch = schedule([task({
      requirements: [
        { resource: pool('a'), quantity: 1, unit: 'persons' },
        { resource: pool('b'), quantity: 1, unit: 'persons' },
      ],
    })]);
    const [x, y] = sch.tasks[0].requirements;
    expect(x.id).toBeTruthy();
    expect(x.id).not.toBe(y.id);
  });

  it('has none when a task needs nothing', () => {
    expect(schedule([task()]).tasks[0].requirements).toEqual([]);
  });
});

describe('malformed demand is refused, never dropped', () => {
  const bad = (requirements: unknown[]) => () =>
    schedule([task({ requirements: requirements as never })]);

  it('refuses a requirement for zero', () => {
    // Zero demand is not a requirement, it is the absence of one — and a zero line would be
    // counted by every rollup while claiming a task needs something it does not.
    expect(bad([{ resource: pool('x'), quantity: 0, unit: 'persons' }]))
      .toThrow(/must be for more than zero/);
    expect(bad([{ resource: pool('x'), quantity: -2, unit: 'persons' }]))
      .toThrow(/must be for more than zero/);
  });

  it('refuses a requirement naming no valid resource', () => {
    expect(bad([{ resource: { resourceType: 'crane', canonicalResourceId: 'x' }, quantity: 1, unit: 'units' }]))
      .toThrow(/must name a valid resource/);
    expect(bad([{ resource: { resourceType: 'pool', canonicalResourceId: '  ' }, quantity: 1, unit: 'persons' }]))
      .toThrow(/must name a valid resource/);
  });

  it('refuses an unknown unit rather than guessing one', () => {
    expect(bad([{ resource: pool('x'), quantity: 1, unit: 'people' }]))
      .toThrow(/hours, persons, crews or units/);
  });

  it('refuses the same resource twice on one task', () => {
    // Two lines for one crane are one requirement recorded twice. The planner would count both,
    // inflating demand against a capacity that never changed.
    expect(bad([
      { resource: asset('CR-01'), quantity: 1, unit: 'units' },
      { resource: asset('CR-01'), quantity: 1, unit: 'units' },
    ])).toThrow(/requires asset:CR-01 twice/);
  });

  it('does NOT confuse the same id under different types', () => {
    const sch = schedule([task({
      requirements: [
        { resource: { resourceType: 'asset', canonicalResourceId: 'X' }, quantity: 1, unit: 'units' },
        { resource: { resourceType: 'vehicle', canonicalResourceId: 'X' }, quantity: 1, unit: 'units' },
      ],
    })]);
    expect(sch.tasks[0].requirements).toHaveLength(2);
  });

  it('refuses the whole save rather than saving a partial task list', () => {
    // One malformed requirement fails the write. Accepting the good tasks and discarding the bad
    // demand would leave a plan that looks complete and is not.
    expect(() => schedule([
      task({ name: 'Good', requirements: [{ resource: pool('a'), quantity: 1, unit: 'persons' }] }),
      task({ name: 'Bad', requirements: [{ resource: pool('b'), quantity: 0, unit: 'persons' }] }),
    ])).toThrow(/"Bad"/);
  });
});

describe('requirements are authored input, round-tripped like every other field', () => {
  it('survives an edit that sends them back', () => {
    const sch = schedule([task({ requirements: [{ resource: pool('elv'), quantity: 4, unit: 'persons' }] })]);
    const before = sch.tasks[0];
    const after = setScheduleTasks(sch, [{
      id: before.id, name: 'Pull cables (revised)',
      plannedStart: before.plannedStart, plannedEnd: before.plannedEnd,
      requirements: before.requirements,
    }]);
    expect(after.tasks[0].id).toBe(before.id);
    expect(after.tasks[0].requirements).toHaveLength(1);
    expect(after.tasks[0].requirements[0].quantity).toBe(4);
  });

  it('is cleared when an edit omits them, because demand is stated not remembered', () => {
    // Unlike a baseline — which the system captured and therefore preserves — a requirement is
    // something a person asserts. An edit that says nothing about demand is saying there is none,
    // and quietly re-adding the old lines would put demand back that nobody re-stated.
    const sch = schedule([task({ requirements: [{ resource: pool('elv'), quantity: 4, unit: 'persons' }] })]);
    const before = sch.tasks[0];
    const after = setScheduleTasks(sch, [{
      id: before.id, name: before.name,
      plannedStart: before.plannedStart, plannedEnd: before.plannedEnd,
    }]);
    expect(after.tasks[0].requirements).toEqual([]);
  });

  it('is ordered deterministically, so two identical saves produce identical rows', () => {
    const reqs = [
      { resource: pool('zzz'), quantity: 1, unit: 'persons' as const },
      { resource: asset('aaa'), quantity: 1, unit: 'units' as const },
    ];
    const a = schedule([task({ requirements: reqs })]);
    const b = schedule([task({ requirements: [...reqs].reverse() })]);
    expect(a.tasks[0].requirements.map((r) => r.resource.canonicalResourceId))
      .toEqual(b.tasks[0].requirements.map((r) => r.resource.canonicalResourceId));
  });
});
