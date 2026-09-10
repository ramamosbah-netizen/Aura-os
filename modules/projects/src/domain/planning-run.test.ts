import { describe, it, expect } from 'vitest';
import {
  makeProjectSchedule,
  setScheduleDependencies,
  setScheduleTasks,
  type ProjectSchedule,
} from './schedule';
import { commitBooking } from './resource-booking';
import { externalCommitmentsFor } from './resource-facts';
import type { ResourceRef } from './resource-ref';
import {
  compareProposalToCurrent,
  planInputFromSchedule,
  runPlanning,
} from './planning-run';

/**
 * §22 Step 9 — Planning Run / Solver Proposal.
 *
 * The load-bearing test is the invariant: a run must not mutate current or baseline dates merely
 * because it executed (DG-22.4). The rest prove the proposal is a faithful, comparable rendering of
 * the pure planner's output, and that the Step 7 resolver and the dependency network feed it.
 */

const TENANT = 's22-step9';
const PROJECT = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const OTHER_PROJECT = 'bbbbbbbb-0000-4000-8000-0000000000b2';
const CRANE: ResourceRef = { resourceType: 'asset', canonicalResourceId: 'cccccccc-0000-4000-8000-00000000c1a5' };
const T1 = '11111111-0000-4000-8000-000000000001';
const T2 = '22222222-0000-4000-8000-000000000002';
const START = '2026-03-09'; // Monday

/** Two tasks that both want the one crane on day one — levelling must move the later-id one. */
function contendingSchedule(): ProjectSchedule {
  return makeProjectSchedule({
    tenantId: TENANT,
    projectId: PROJECT,
    tasks: [
      { id: T1, name: 'Lift A', plannedStart: START, plannedEnd: START, durationWorkingDays: 1, requirements: [{ resource: CRANE, quantity: 1, unit: 'units' }] },
      { id: T2, name: 'Lift B', plannedStart: START, plannedEnd: START, durationWorkingDays: 1, requirements: [{ resource: CRANE, quantity: 1, unit: 'units' }] },
    ],
  });
}

const craneCapacityOne = { capacities: [{ resource: CRANE, unit: 'units' as const, quantity: 1 }], projectStart: START };

describe('runPlanning — the governed chain', () => {
  it('does NOT mutate the schedule it ran against (current and baseline dates untouched)', () => {
    const schedule = contendingSchedule();
    const before = JSON.stringify(schedule);

    const run = runPlanning(schedule, craneCapacityOne);

    // The schedule is byte-for-byte what it was. The proposal lives elsewhere.
    expect(JSON.stringify(schedule)).toBe(before);
    // And the run genuinely proposed a change — otherwise "unchanged" would prove nothing.
    const t2 = run.proposal.placements.find((p) => p.taskId === T2)!;
    expect(t2.start).not.toBe(START);
  });

  it('produces a proposal that is proposed, not accepted, and links back to its schedule', () => {
    const schedule = contendingSchedule();
    const run = runPlanning(schedule, craneCapacityOne, { ranBy: 'planner-user' });
    expect(run.status).toBe('proposed');
    expect(run.scheduleId).toBe(schedule.id);
    expect(run.tenantId).toBe(TENANT);
    expect(run.projectId).toBe(PROJECT);
    expect(run.ranBy).toBe('planner-user');
  });

  it('levels the contended crane: one task stays, the later-id one is pushed a working day', () => {
    const run = runPlanning(contendingSchedule(), craneCapacityOne);
    const t1 = run.proposal.placements.find((p) => p.taskId === T1)!;
    const t2 = run.proposal.placements.find((p) => p.taskId === T2)!;
    expect(t1.start).toBe('2026-03-09');
    expect(t2.start).toBe('2026-03-10');
    expect(run.proposal.feasibility).toBe('AVAILABLE'); // levelling resolved it
    expect(run.proposal.established).toBe(true);
  });

  it('is deterministic — two runs propose exactly the same thing', () => {
    const schedule = contendingSchedule();
    const a = runPlanning(schedule, craneCapacityOne);
    const b = runPlanning(schedule, craneCapacityOne);
    expect(a.proposal).toEqual(b.proposal); // id and ranAt differ; the proposal does not
  });

  it('carries a cross-project conflict in from the Step 7 resolver bridge', () => {
    // One task needs the crane; another project already holds it that day. capacity 1, demand 1+1.
    const schedule = makeProjectSchedule({
      tenantId: TENANT, projectId: PROJECT,
      tasks: [{ id: T1, name: 'Lift A', plannedStart: START, plannedEnd: START, durationWorkingDays: 1, requirements: [{ resource: CRANE, quantity: 1, unit: 'units' }] }],
    });
    const theirBooking = commitBooking({ tenantId: TENANT, projectId: OTHER_PROJECT, resource: CRANE, unit: 'units', quantity: 1, from: START, to: START });

    const run = runPlanning(schedule, {
      ...craneCapacityOne,
      externalCommitments: externalCommitmentsFor(PROJECT, [theirBooking]),
    });

    expect(run.proposal.feasibility).toBe('CONFLICTED');
    expect(run.proposal.established).toBe(false);
    expect(run.proposal.resourceVerdicts[0].conflictDays).toContain(START);
  });
});

describe('planInputFromSchedule — translating the aggregate', () => {
  it('reads finish-to-start predecessors off the dependency network by identity', () => {
    const base = makeProjectSchedule({
      tenantId: TENANT, projectId: PROJECT,
      tasks: [
        { id: T1, name: 'Dig', plannedStart: START, plannedEnd: START, durationWorkingDays: 1 },
        { id: T2, name: 'Pour', plannedStart: START, plannedEnd: START, durationWorkingDays: 1 },
      ],
    });
    const withEdge = setScheduleDependencies(base, [{ predecessorTaskId: T1, successorTaskId: T2 }]);

    const input = planInputFromSchedule(withEdge, { projectStart: START });
    expect(input.tasks.find((t) => t.id === T2)!.dependencies).toEqual([T1]);
    expect(input.tasks.find((t) => t.id === T1)!.dependencies).toEqual([]);

    // And the run honours it: Pour starts the working day after Dig finishes.
    const run = runPlanning(withEdge, { projectStart: START });
    expect(run.proposal.placements.find((p) => p.taskId === T1)!.start).toBe('2026-03-09');
    expect(run.proposal.placements.find((p) => p.taskId === T2)!.start).toBe('2026-03-10');
  });

  it('an empty schedule needs a supplied project start, and says so', () => {
    const empty = makeProjectSchedule({ tenantId: TENANT, projectId: PROJECT });
    expect(() => planInputFromSchedule(empty)).toThrow(/needs a project start/);
    expect(() => planInputFromSchedule(empty, { projectStart: START })).not.toThrow();
  });
});

describe('compareProposalToCurrent — what accepting would change', () => {
  it('classifies each task as unchanged or moved, and counts the moves', () => {
    const schedule = contendingSchedule();
    const run = runPlanning(schedule, craneCapacityOne);

    const cmp = compareProposalToCurrent(schedule, run.proposal);
    const t1 = cmp.changes.find((c) => c.taskId === T1)!;
    const t2 = cmp.changes.find((c) => c.taskId === T2)!;
    expect(t1.change).toBe('UNCHANGED'); // authored 03-09, proposed 03-09
    expect(t2.change).toBe('MOVED');     // authored 03-09, proposed 03-10
    expect(cmp.movedCount).toBe(1);
    expect(cmp.currentFinish).toBe('2026-03-09');
    expect(cmp.proposedFinish).toBe('2026-03-10');
  });

  it('marks a task that would become unplaceable', () => {
    // T2 has no authored duration, so the solver cannot place it — but it currently has dates.
    const schedule = setScheduleTasks(contendingSchedule(), [
      { id: T1, name: 'Lift A', plannedStart: START, plannedEnd: START, durationWorkingDays: 1 },
      { id: T2, name: 'Lift B', plannedStart: START, plannedEnd: START }, // duration omitted
    ]);
    const run = runPlanning(schedule, { projectStart: START });

    const cmp = compareProposalToCurrent(schedule, run.proposal);
    expect(cmp.changes.find((c) => c.taskId === T2)!.change).toBe('BECAME_UNPLACEABLE');
    expect(run.proposal.planningDeficiencies.some((d) => d.taskId === T2)).toBe(true);
  });
});
