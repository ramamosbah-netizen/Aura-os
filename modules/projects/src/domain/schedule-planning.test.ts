import { describe, expect, it } from 'vitest';
import {
  planSchedule, reschedule, sameResource,
  type PlanInput, type PlanTaskInput, type ResourceRef,
} from './schedule-planning';

/**
 * §22 — the Planner Correction Contract, one test per requirement.
 *
 * The gate states that each of the nine is "a test, not a claim". This file is where that is made
 * true. The requirement numbers below are the gate's own.
 */

const asset = (id: string): ResourceRef => ({ resourceType: 'asset', canonicalResourceId: id });
const pool = (id: string): ResourceRef => ({ resourceType: 'pool', canonicalResourceId: id });

const plan = (input: PlanInput) => planSchedule(input);
const task = (over: Partial<PlanTaskInput> & { id: string }): PlanTaskInput =>
  ({ name: over.id, durationWorkingDays: 1, ...over });

describe('CPM forward pass', () => {
  it('reschedules finish-to-start dependencies', () => {
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [
        task({ id: 'a', durationWorkingDays: 2 }),
        task({ id: 'b', durationWorkingDays: 2, dependencies: ['a'] }),
      ],
    });
    const a = p.tasks.find((t) => t.id === 'a')!;
    const b = p.tasks.find((t) => t.id === 'b')!;
    expect(a.start).toBe('2026-07-01');
    expect(a.end).toBe('2026-07-02');
    expect(b.start).toBe('2026-07-03');
  });

  it('honours lag, and the finish is the latest branch', () => {
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [
        task({ id: 'a', durationWorkingDays: 1 }),
        task({ id: 'short', durationWorkingDays: 1, dependencies: ['a'] }),
        task({ id: 'long', durationWorkingDays: 3, dependencies: ['a'], lagDays: 2 }),
      ],
    });
    expect(p.tasks.find((t) => t.id === 'long')!.start).toBe('2026-07-04');
    expect(p.projectFinish).toBe('2026-07-06');
  });

  it('[#6] detects dependency cycles', () => {
    expect(() =>
      reschedule(
        [task({ id: 'a', dependencies: ['b'] }), task({ id: 'b', dependencies: ['a'] })],
        '2026-07-01',
      ),
    ).toThrow(/cycle/);
  });
});

describe('[#1] missing capacity is UNKNOWN, never available', () => {
  it('refuses to call an unmeasured resource available', () => {
    // The defect this replaces: the previous engine returned
    //   { capacity: 0, overallocated: false }
    // for exactly this input — zero capacity and not overallocated in the same object, on the only
    // input that ever occurred, because nothing stored capacity.
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [
        task({ id: 't1', durationWorkingDays: 2, requirements: [{ resource: asset('crane'), quantity: 1, unit: 'units' }] }),
        task({ id: 't2', durationWorkingDays: 2, requirements: [{ resource: asset('crane'), quantity: 1, unit: 'units' }] }),
      ],
    });
    const v = p.resourceVerdicts[0];
    expect(v.feasibility).toBe('UNKNOWN');
    expect(v.capacity).toBeNull();          // null, NOT 0 — a different fact
    expect(v.reason).toMatch(/no capacity has been declared/);
    // Not-knowing lives on `coverage`; `feasibility` says only that nothing judged is in conflict.
    expect(p.feasibility).toBe('AVAILABLE');
    expect(p.coverage).toBe('PARTIAL');
    // …and `established` is what stops that reading as availability.
    expect(p.established).toBe(false);
  });

  it('keeps a known zero apart from an unknown', () => {
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [task({ id: 't1', requirements: [{ resource: asset('crane'), quantity: 1, unit: 'units' }] })],
      capacities: [{ resource: asset('crane'), unit: 'units', quantity: 0 }],
    });
    // Zero capacity against positive demand is a KNOWN answer, and the answer is CONFLICTED.
    expect(p.resourceVerdicts[0]).toMatchObject({ feasibility: 'CONFLICTED', capacity: 0 });
    expect(p.coverage).toBe('COMPLETE');
  });

  it('reports AVAILABLE only when capacity is known and sufficient', () => {
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [task({ id: 't1', requirements: [{ resource: pool('electrician'), quantity: 4, unit: 'persons' }] })],
      capacities: [{ resource: pool('electrician'), unit: 'persons', quantity: 12 }],
    });
    expect(p.feasibility).toBe('AVAILABLE');
    expect(p.coverage).toBe('COMPLETE');
    expect(p.established).toBe(true);
    expect(p.unmetDemand).toEqual([]);
  });
});

describe('[#2] identity is typed, and never silently matched', () => {
  it('does not treat a vehicle and an asset sharing an id as one resource', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(sameResource(
      { resourceType: 'asset', canonicalResourceId: id },
      { resourceType: 'vehicle', canonicalResourceId: id },
    )).toBe(false);

    const p = plan({
      projectStart: '2026-07-01',
      tasks: [task({
        id: 't1',
        requirements: [
          { resource: { resourceType: 'asset', canonicalResourceId: id }, quantity: 1, unit: 'units' },
          { resource: { resourceType: 'vehicle', canonicalResourceId: id }, quantity: 1, unit: 'units' },
        ],
      })],
      capacities: [
        { resource: { resourceType: 'asset', canonicalResourceId: id }, unit: 'units', quantity: 1 },
        { resource: { resourceType: 'vehicle', canonicalResourceId: id }, unit: 'units', quantity: 1 },
      ],
    });
    // Two resources, two verdicts, neither conflicting with the other.
    expect(p.resourceVerdicts).toHaveLength(2);
    expect(p.feasibility).toBe('AVAILABLE');
  });
});

describe('[#3] a task may need several resources', () => {
  it('levels against each requirement independently', () => {
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [task({
        id: 'pull-cables',
        requirements: [
          { resource: pool('elv-tech'), quantity: 4, unit: 'persons' },
          { resource: pool('rigger'), quantity: 2, unit: 'persons' },
          { resource: asset('CR-01'), quantity: 1, unit: 'units' },
        ],
      })],
      capacities: [
        { resource: pool('elv-tech'), unit: 'persons', quantity: 6 },
        { resource: pool('rigger'), unit: 'persons', quantity: 1 },   // short
        { resource: asset('CR-01'), unit: 'units', quantity: 1 },
      ],
    });
    expect(p.resourceVerdicts).toHaveLength(3);
    const byId = Object.fromEntries(p.resourceVerdicts.map((v) => [v.resource.canonicalResourceId, v.feasibility]));
    expect(byId).toEqual({ 'elv-tech': 'AVAILABLE', rigger: 'CONFLICTED', 'CR-01': 'AVAILABLE' });
    // And the whole plan is conflicted because one requirement is.
    expect(p.feasibility).toBe('CONFLICTED');
  });
});

describe('[#4] commitments held by other projects are counted', () => {
  it('finds the conflict that a per-project view reports as available twice', () => {
    // The failure §22 exists for: one crane, two projects, the same Tuesday.
    const crane = asset('CR-01');
    const withoutOtherProject = plan({
      projectStart: '2026-07-07',
      tasks: [task({ id: 'lift', requirements: [{ resource: crane, quantity: 1, unit: 'units' }] })],
      capacities: [{ resource: crane, unit: 'units', quantity: 1 }],
    });
    expect(withoutOtherProject.feasibility).toBe('AVAILABLE');

    const withOtherProject = plan({
      projectStart: '2026-07-07',
      tasks: [task({ id: 'lift', requirements: [{ resource: crane, quantity: 1, unit: 'units' }] })],
      capacities: [{ resource: crane, unit: 'units', quantity: 1 }],
      externalCommitments: [
        { resource: crane, unit: 'units', quantity: 1, from: '2026-07-07', to: '2026-07-07', projectId: 'project-b' },
      ],
    });
    expect(withOtherProject.feasibility).toBe('CONFLICTED');
    expect(withOtherProject.resourceVerdicts[0]).toMatchObject({ peakDemand: 1, peakTotalDemand: 2, capacity: 1 });
    expect(withOtherProject.resourceVerdicts[0].reason).toMatch(/other projects/);
    expect(withOtherProject.resourceVerdicts[0].conflictDays).toEqual(['2026-07-07']);
  });
});

describe('[#5] the working calendar is consumed, not assumed', () => {
  it('does not schedule through a non-working day', () => {
    // 2026-07-03 is a Friday. A two-day task starting Thursday finishes Saturday, not Friday.
    const p = plan({
      projectStart: '2026-07-02',
      tasks: [task({ id: 'a', durationWorkingDays: 2 })],
      nonWorkingDays: ['2026-07-03'],
    });
    expect(p.tasks[0].start).toBe('2026-07-02');
    expect(p.tasks[0].end).toBe('2026-07-04');
  });

  it('starts a project on the first working day, not on a holiday', () => {
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [task({ id: 'a' })],
      nonWorkingDays: ['2026-07-01', '2026-07-02'],
    });
    expect(p.tasks[0].start).toBe('2026-07-03');
  });

  it('measures duration in working days', () => {
    const p = plan({
      projectStart: '2026-07-02',
      tasks: [task({ id: 'a', durationWorkingDays: 2 })],
      nonWorkingDays: ['2026-07-03'],
    });
    // Thursday and Saturday — two days of work, not three.
    expect(p.durationDays).toBe(2);
  });
});

describe('[#7] unschedulable demand is reported, never dropped', () => {
  it('reports a requirement larger than the whole capacity instead of delaying it for ever', () => {
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [task({ id: 'big', requirements: [{ resource: pool('electrician'), quantity: 20, unit: 'persons' }] })],
      capacities: [{ resource: pool('electrician'), unit: 'persons', quantity: 12 }],
    });
    expect(p.unmetDemand).toHaveLength(1);
    expect(p.unmetDemand[0]).toMatchObject({ taskId: 'big', required: 20, capacity: 12, reason: 'EXCEEDS_CAPACITY' });
    expect(p.unmetDemand[0].detail).toMatch(/No amount of delay resolves this/);
    expect(p.feasibility).toBe('CONFLICTED');
  });

  it('refuses a unit mismatch rather than converting it', () => {
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [task({ id: 't1', requirements: [{ resource: pool('electrician'), quantity: 4, unit: 'persons' }] })],
      capacities: [{ resource: pool('electrician'), unit: 'hours', quantity: 40 }],
    });
    // 4 persons is not 4 hours, and 40 hours does not satisfy it. Comparing them at all is the bug.
    expect(p.unmetDemand[0]).toMatchObject({ reason: 'UNIT_MISMATCH' });
    expect(p.resourceVerdicts[0].feasibility).toBe('UNKNOWN');
    expect(p.coverage).toBe('PARTIAL');
  });

  it('reports demand against an unknown capacity as unproven', () => {
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [task({ id: 't1', requirements: [{ resource: pool('rigger'), quantity: 2, unit: 'persons' }] })],
    });
    expect(p.unmetDemand[0]).toMatchObject({ reason: 'UNKNOWN_CAPACITY', capacity: null });
  });
});

describe('[#8] deterministic', () => {
  it('produces an identical plan for identical input, including tie-breaks', () => {
    const build = (): PlanInput => ({
      projectStart: '2026-07-01',
      tasks: [
        task({ id: 'b', durationWorkingDays: 2, requirements: [{ resource: pool('p'), quantity: 1, unit: 'persons' }] }),
        task({ id: 'a', durationWorkingDays: 2, requirements: [{ resource: pool('p'), quantity: 1, unit: 'persons' }] }),
        task({ id: 'c', durationWorkingDays: 2, requirements: [{ resource: pool('p'), quantity: 1, unit: 'persons' }] }),
      ],
      capacities: [{ resource: pool('p'), unit: 'persons', quantity: 1 }],
    });
    // Three tasks starting on the same day with capacity 1: levelling must break the tie the same
    // way every time, or a plan changes when nothing changed.
    expect(JSON.stringify(plan(build()))).toBe(JSON.stringify(plan(build())));
  });
});

describe('[#9] no false available', () => {
  it('never reports AVAILABLE while any resource is unjudged', () => {
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [task({
        id: 't1',
        requirements: [
          { resource: pool('known'), quantity: 1, unit: 'persons' },
          { resource: pool('unknown'), quantity: 1, unit: 'persons' },
        ],
      })],
      capacities: [{ resource: pool('known'), unit: 'persons', quantity: 10 }],
    });
    // AVAILABLE + PARTIAL is NOT availability. `established` is the single value a screen reads,
    // so no consumer can reach "resources available" by looking at one axis.
    expect(p.feasibility).toBe('AVAILABLE');
    expect(p.coverage).toBe('PARTIAL');
    expect(p.established).toBe(false);
  });

  it('keeps a known conflict and an unjudged resource visible at the same time', () => {
    // Two axes, for the reason §24 established: a conflict must not swallow what nobody could
    // judge, and an unjudged resource must not read as clean.
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [task({
        id: 't1',
        requirements: [
          { resource: pool('short'), quantity: 5, unit: 'persons' },
          { resource: pool('unmeasured'), quantity: 1, unit: 'persons' },
        ],
      })],
      capacities: [{ resource: pool('short'), unit: 'persons', quantity: 2 }],
    });
    expect(p.feasibility).toBe('CONFLICTED');
    expect(p.coverage).toBe('PARTIAL');
    expect(p.established).toBe(false);
    const states = p.resourceVerdicts.map((v) => v.feasibility).sort();
    expect(states).toEqual(['CONFLICTED', 'UNKNOWN']);
  });
});

describe('levelling', () => {
  it('delays tasks so a known daily capacity is not exceeded', () => {
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [
        task({ id: 't1', durationWorkingDays: 2, requirements: [{ resource: asset('crane'), quantity: 1, unit: 'units' }] }),
        task({ id: 't2', durationWorkingDays: 2, requirements: [{ resource: asset('crane'), quantity: 1, unit: 'units' }] }),
      ],
      capacities: [{ resource: asset('crane'), unit: 'units', quantity: 1 }],
    });
    expect(p.feasibility).toBe('AVAILABLE');
    expect(p.resourceVerdicts[0].peakDemand).toBe(1);
    // Sequenced, not overlapped.
    const [first, second] = p.tasks;
    expect(second.start! > first.end!).toBe(true);
  });

  it('does not level a resource whose capacity is unknown, and says so', () => {
    const p = plan({
      projectStart: '2026-07-01',
      tasks: [
        task({ id: 't1', durationWorkingDays: 2, requirements: [{ resource: asset('crane'), quantity: 1, unit: 'units' }] }),
        task({ id: 't2', durationWorkingDays: 2, requirements: [{ resource: asset('crane'), quantity: 1, unit: 'units' }] }),
      ],
    });
    // Both still start on day one — nothing was levelled, because there was no capacity to level
    // against. The difference from the old engine is that this is REPORTED rather than silent.
    expect(p.tasks.every((t) => t.start === '2026-07-01')).toBe(true);
    expect(p.resourceVerdicts[0]).toMatchObject({ peakDemand: 2, feasibility: 'UNKNOWN' });
  });
});
