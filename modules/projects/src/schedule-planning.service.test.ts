import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventStore } from '@aura/core';
import { ScheduleService } from './schedule.service';
import { InMemoryScheduleStore } from './in-memory-schedule-store';
import { InMemoryResourceFactsStore } from './in-memory-resource-facts-store';
import { InMemoryPlanningRunStore } from './in-memory-planning-run-store';
import { makeProjectSchedule, type ProjectSchedule } from './domain/schedule';
import { makeResourceCapacity } from './domain/resource-pool';
import { commitBooking } from './domain/resource-booking';
import type { ResourceRef } from './domain/resource-ref';

/**
 * §22 Step 11 — the API/BFF wiring, proven at the service boundary with in-memory stores.
 *
 * The service RESOLVES facts from the cross-project store (Step 7) and PERSISTS runs and acceptances.
 * These prove the chain end to end without HTTP: a run persists a proposal and moves no stored date; a
 * cross-project booking read from the store makes the proposal conflicted; acceptance promotes the
 * plan and supersedes siblings; the governance (acknowledgement, discard reason) holds through the
 * service.
 */

const TENANT = 's22-step11';
const PROJECT = 'aaaaaaaa-0000-4000-8000-0000000011a1';
const OTHER_PROJECT = 'bbbbbbbb-0000-4000-8000-0000000011b2';
const CRANE: ResourceRef = { resourceType: 'asset', canonicalResourceId: 'cccccccc-0000-4000-8000-0000000011c3' };
const T1 = '11111111-0000-4000-8000-000000001101';
const T2 = '22222222-0000-4000-8000-000000001102';
const START = '2026-03-09';

const capacity = (qty: number) =>
  makeResourceCapacity({ tenantId: TENANT, resource: CRANE, unit: 'units', quantity: qty, from: '2026-03-01', to: '2026-03-31' });

describe('ScheduleService — §22 planning runs and acceptance', () => {
  let store: InMemoryScheduleStore;
  let facts: InMemoryResourceFactsStore;
  let runs: InMemoryPlanningRunStore;
  let events: EventStore;
  let svc: ScheduleService;

  const twoContendingTasks = () => ({
    tenantId: TENANT, projectId: PROJECT,
    tasks: [
      { id: T1, name: 'Lift A', plannedStart: START, plannedEnd: START, durationWorkingDays: 1, requirements: [{ resource: CRANE, quantity: 1, unit: 'units' as const }] },
      { id: T2, name: 'Lift B', plannedStart: START, plannedEnd: START, durationWorkingDays: 1, requirements: [{ resource: CRANE, quantity: 1, unit: 'units' as const }] },
    ],
  });

  const seed = async (schedule: ProjectSchedule) => { await store.create(schedule); };

  beforeEach(() => {
    store = new InMemoryScheduleStore();
    facts = new InMemoryResourceFactsStore();
    runs = new InMemoryPlanningRunStore();
    events = { append: vi.fn(async () => undefined), appendWithClient: vi.fn(async () => undefined) } as unknown as EventStore;
    svc = new ScheduleService(store, events, facts, runs, null);
  });

  it('runs the solver against resolved capacity, persists a proposal, and moves no stored date', async () => {
    await seed(makeProjectSchedule(twoContendingTasks()));
    facts.addCapacity(capacity(1)); // one crane

    const { run, comparison } = await svc.runPlanning(TENANT, PROJECT, { ranBy: 'planner' });

    expect(run.status).toBe('proposed');
    expect(await runs.get(run.id)).not.toBeNull();          // persisted
    expect(run.proposal.established).toBe(true);            // levelling resolved the contention
    expect(comparison.movedCount).toBe(1);                  // T2 pushed a working day
    // The stored schedule is untouched — a run proposes, it does not mutate.
    const stored = await store.getByProject(TENANT, PROJECT);
    expect(stored!.tasks.find((t) => t.id === T2)!.plannedStart).toBe(START);
    expect(events.append).toHaveBeenCalled();
  });

  it('carries a cross-project conflict read from the store into the proposal', async () => {
    await seed(makeProjectSchedule({
      tenantId: TENANT, projectId: PROJECT,
      tasks: [{ id: T1, name: 'Lift A', plannedStart: START, plannedEnd: START, durationWorkingDays: 1, requirements: [{ resource: CRANE, quantity: 1, unit: 'units' }] }],
    }));
    facts.addCapacity(capacity(1));
    // Another project already holds the crane that day.
    facts.addBooking(commitBooking({ tenantId: TENANT, projectId: OTHER_PROJECT, resource: CRANE, unit: 'units', quantity: 1, from: START, to: START }));

    const { run } = await svc.runPlanning(TENANT, PROJECT);
    expect(run.proposal.feasibility).toBe('CONFLICTED');
    expect(run.proposal.established).toBe(false);
  });

  it('accepts an established proposal: promotes the plan, marks accepted, supersedes siblings', async () => {
    await seed(makeProjectSchedule(twoContendingTasks()));
    facts.addCapacity(capacity(1));

    const { run: runA } = await svc.runPlanning(TENANT, PROJECT);
    const { run: runB } = await svc.runPlanning(TENANT, PROJECT); // a second outstanding proposal

    const { schedule } = await svc.acceptRun(TENANT, runA.id, { acceptedBy: 'pm-1' });
    expect(schedule.tasks.find((t) => t.id === T2)!.plannedStart).toBe('2026-03-10'); // promoted

    const stored = await store.getByProject(TENANT, PROJECT);
    expect(stored!.tasks.find((t) => t.id === T2)!.plannedStart).toBe('2026-03-10'); // persisted
    expect((await runs.get(runA.id))!.status).toBe('accepted');
    expect((await runs.get(runB.id))!.status).toBe('superseded');
  });

  it('refuses to accept a conflicted proposal without an acknowledgement, and accepts with one', async () => {
    await seed(makeProjectSchedule({
      tenantId: TENANT, projectId: PROJECT,
      tasks: [{ id: T1, name: 'Lift A', plannedStart: START, plannedEnd: START, durationWorkingDays: 1, requirements: [{ resource: CRANE, quantity: 1, unit: 'units' }] }],
    }));
    facts.addCapacity(capacity(1));
    facts.addBooking(commitBooking({ tenantId: TENANT, projectId: OTHER_PROJECT, resource: CRANE, unit: 'units', quantity: 1, from: START, to: START }));

    const { run } = await svc.runPlanning(TENANT, PROJECT);
    await expect(svc.acceptRun(TENANT, run.id, {})).rejects.toThrow(/acknowledgement/);

    const { run: accepted } = await svc.acceptRun(TENANT, run.id, { acknowledgeReason: 'second crane hired' });
    expect(accepted.status).toBe('accepted');
    expect(accepted.acceptanceReason).toMatch(/second crane/);
  });

  it('discards a proposal with a reason and refuses a foreign tenant’s run', async () => {
    await seed(makeProjectSchedule(twoContendingTasks()));
    facts.addCapacity(capacity(1));
    const { run } = await svc.runPlanning(TENANT, PROJECT);

    const discarded = await svc.discardRun(TENANT, run.id, 'authored durations wrong');
    expect(discarded.status).toBe('discarded');

    // A different tenant cannot see or act on this run.
    await expect(svc.getRun('someone-else', run.id)).rejects.toThrow(/not found/);
  });

  it('rejects planning an empty or missing schedule', async () => {
    await expect(svc.runPlanning(TENANT, PROJECT)).rejects.toThrow(/no schedule/);
    await seed(makeProjectSchedule({ tenantId: TENANT, projectId: PROJECT }));
    await expect(svc.runPlanning(TENANT, PROJECT)).rejects.toThrow(/empty schedule/);
  });
});
