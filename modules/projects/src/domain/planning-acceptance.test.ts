import { describe, it, expect } from 'vitest';
import {
  makeProjectSchedule,
  setBaseline,
  setScheduleTasks,
  type ProjectSchedule,
} from './schedule';
import { commitBooking } from './resource-booking';
import { externalCommitmentsFor } from './resource-facts';
import type { ResourceRef } from './resource-ref';
import { runPlanning, type PlanningRun } from './planning-run';
import { acceptProposal, discardProposal, supersedeProposals } from './planning-acceptance';

/**
 * §22 Step 10 — governed acceptance.
 *
 * The load-bearing facts: acceptance is the ONLY thing that promotes proposed dates to the current
 * plan; it touches the current plan and nothing else (baseline stays); and it is governed — two
 * structural refusals and one acknowledgement cost, mirroring a booking's over-capacity reason.
 */

const TENANT = 's22-step10';
const PROJECT = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const OTHER_PROJECT = 'bbbbbbbb-0000-4000-8000-0000000000b2';
const CRANE: ResourceRef = { resourceType: 'asset', canonicalResourceId: 'cccccccc-0000-4000-8000-00000000c1a5' };
const T1 = '11111111-0000-4000-8000-000000000001';
const T2 = '22222222-0000-4000-8000-000000000002';
const START = '2026-03-09';

const craneCapacityOne = { capacities: [{ resource: CRANE, unit: 'units' as const, quantity: 1 }], projectStart: START };

/** Two tasks contending for one crane — levelling resolves it, so the proposal is established. */
function contendingSchedule(): ProjectSchedule {
  return makeProjectSchedule({
    tenantId: TENANT, projectId: PROJECT,
    tasks: [
      { id: T1, name: 'Lift A', plannedStart: START, plannedEnd: START, durationWorkingDays: 1, requirements: [{ resource: CRANE, quantity: 1, unit: 'units' }] },
      { id: T2, name: 'Lift B', plannedStart: START, plannedEnd: START, durationWorkingDays: 1, requirements: [{ resource: CRANE, quantity: 1, unit: 'units' }] },
    ],
  });
}

describe('acceptProposal — promotion to the current plan', () => {
  it('promotes proposed dates to plannedStart/End and leaves the input schedule untouched', () => {
    const schedule = contendingSchedule();
    const before = JSON.stringify(schedule);
    const run = runPlanning(schedule, craneCapacityOne);

    const { schedule: accepted } = acceptProposal(schedule, run);

    // Input is unchanged; a new schedule carries the promoted dates.
    expect(JSON.stringify(schedule)).toBe(before);
    expect(accepted.tasks.find((t) => t.id === T1)!.plannedStart).toBe('2026-03-09');
    expect(accepted.tasks.find((t) => t.id === T2)!.plannedStart).toBe('2026-03-10'); // levelled forward
  });

  it('touches the current plan only — baseline and actuals are left as they were', () => {
    const baselined = setBaseline(contendingSchedule()); // baseline captured at the authored dates
    const run = runPlanning(baselined, craneCapacityOne);

    const { schedule: accepted } = acceptProposal(baselined, run);
    const t2 = accepted.tasks.find((t) => t.id === T2)!;
    expect(t2.plannedStart).toBe('2026-03-10');       // current moved
    expect(t2.baselineStart).toBe('2026-03-09');      // baseline did NOT
    expect(accepted.baselineSetAt).toBe(baselined.baselineSetAt);
  });

  it('marks the run accepted, with who and when', () => {
    const schedule = contendingSchedule();
    const run = runPlanning(schedule, craneCapacityOne);
    const { run: accepted } = acceptProposal(schedule, run, { acceptedBy: 'pm-1' });
    expect(accepted.status).toBe('accepted');
    expect(accepted.acceptedBy).toBe('pm-1');
    expect(accepted.acceptedAt).toBeTruthy();
    expect(accepted.acceptanceReason).toBeNull(); // established plan needs no acknowledgement
  });

  it('refuses to accept a run that is not proposed', () => {
    const schedule = contendingSchedule();
    const run = runPlanning(schedule, craneCapacityOne);
    const { run: accepted } = acceptProposal(schedule, run);
    expect(() => acceptProposal(schedule, accepted)).toThrow(/only a proposed run/);
  });

  it('refuses a proposal that belongs to a different schedule', () => {
    const run = runPlanning(contendingSchedule(), craneCapacityOne);
    const otherSchedule = contendingSchedule(); // a different id
    expect(() => acceptProposal(otherSchedule, run)).toThrow(/different schedule/);
  });
});

describe('acceptProposal — the structural refusals', () => {
  it('refuses when any task is unplaceable — there are no dates to make current', () => {
    // T2 has no authored duration, so the solver cannot place it.
    const schedule = setScheduleTasks(contendingSchedule(), [
      { id: T1, name: 'Lift A', plannedStart: START, plannedEnd: START, durationWorkingDays: 1 },
      { id: T2, name: 'Lift B', plannedStart: START, plannedEnd: START }, // duration omitted
    ]);
    const run = runPlanning(schedule, { projectStart: START });
    expect(() => acceptProposal(schedule, run)).toThrow(/unplaceable/);
  });

  it('refuses a stale proposal produced before the schedule changed', () => {
    const schedule = contendingSchedule();
    const run = runPlanning(schedule, craneCapacityOne);
    // A task is added after the run — the proposal no longer describes this schedule.
    const changed = setScheduleTasks(schedule, [
      { id: T1, name: 'Lift A', plannedStart: START, plannedEnd: START, durationWorkingDays: 1 },
      { id: T2, name: 'Lift B', plannedStart: START, plannedEnd: START, durationWorkingDays: 1 },
      { id: '33333333-0000-4000-8000-000000000003', name: 'Lift C', plannedStart: START, plannedEnd: START, durationWorkingDays: 1 },
    ]);
    expect(() => acceptProposal(changed, run)).toThrow(/changed since this proposal/);
  });
});

describe('acceptProposal — governed acknowledgement of a not-established plan', () => {
  // One task needs the crane; another project already holds it that day → CONFLICTED but placeable.
  const conflicted = (): { schedule: ProjectSchedule; run: PlanningRun } => {
    const schedule = makeProjectSchedule({
      tenantId: TENANT, projectId: PROJECT,
      tasks: [{ id: T1, name: 'Lift A', plannedStart: START, plannedEnd: START, durationWorkingDays: 1, requirements: [{ resource: CRANE, quantity: 1, unit: 'units' }] }],
    });
    const theirs = commitBooking({ tenantId: TENANT, projectId: OTHER_PROJECT, resource: CRANE, unit: 'units', quantity: 1, from: START, to: START });
    const run = runPlanning(schedule, { ...craneCapacityOne, externalCommitments: externalCommitmentsFor(PROJECT, [theirs]) });
    return { schedule, run };
  };

  it('refuses to accept a conflicted plan with no acknowledgement', () => {
    const { schedule, run } = conflicted();
    expect(run.proposal.established).toBe(false);
    expect(() => acceptProposal(schedule, run)).toThrow(/acknowledgement/);
  });

  it('accepts a conflicted plan when the acknowledgement is given, and records it', () => {
    const { schedule, run } = conflicted();
    const { schedule: accepted, run: acceptedRun } = acceptProposal(schedule, run, {
      acceptedBy: 'pm-1', acknowledgeReason: 'crane conflict accepted; second crane hired for the day',
    });
    expect(acceptedRun.status).toBe('accepted');
    expect(acceptedRun.acceptanceReason).toMatch(/second crane hired/);
    expect(accepted.tasks.find((t) => t.id === T1)!.plannedStart).toBe(START); // still promoted
  });
});

describe('supersedeProposals & discardProposal', () => {
  it('supersedes other proposed runs for the same schedule, sparing accepted and other schedules', () => {
    const schedule = contendingSchedule();
    const runA = runPlanning(schedule, craneCapacityOne);
    const runB = runPlanning(schedule, craneCapacityOne);
    const foreign = runPlanning(contendingSchedule(), craneCapacityOne); // different schedule id
    const { run: acceptedA } = acceptProposal(schedule, runA);

    const after = supersedeProposals([acceptedA, runB, foreign], acceptedA);
    expect(after.find((r) => r.id === acceptedA.id)!.status).toBe('accepted');
    expect(after.find((r) => r.id === runB.id)!.status).toBe('superseded');
    expect(after.find((r) => r.id === foreign.id)!.status).toBe('proposed'); // another schedule, untouched
  });

  it('discards a proposal with a reason, and refuses without one or when not proposed', () => {
    const run = runPlanning(contendingSchedule(), craneCapacityOne);
    const discarded = discardProposal(run, { reason: 'authored durations were wrong; re-running' });
    expect(discarded.status).toBe('discarded');
    expect(discarded.discardedReason).toMatch(/re-running/);
    expect(() => discardProposal(run, { reason: '  ' })).toThrow(/requires a reason/);
    expect(() => discardProposal(discarded, { reason: 'again' })).toThrow(/only a proposed run/);
  });
});
