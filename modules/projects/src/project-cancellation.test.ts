import { describe, it, expect, vi } from 'vitest';
import {
  CommandBus,
  IdempotencyService,
  LockService,
  NullTxRunner,
  type EventStore,
  type AccessService,
} from '@aura/core';
import { ProjectService } from './project.service';
import { InMemoryProjectStore } from './in-memory-project-store';
import { makeProject, type ProjectStatus } from './domain/project';

/**
 * Cancellation is the transition no facts can block, which is exactly why it needs its own tests.
 *
 * The gate tests prove what the other transitions REFUSE. These prove what cancellation RECORDS —
 * because a transition that is always allowed and carries no evidence is indistinguishable from a
 * field someone edited, and that is the failure mode being guarded against here.
 */
function buildService() {
  const store = new InMemoryProjectStore();
  const appended: { type: string; actorId: string | null; payload: Record<string, unknown> }[] = [];
  const capture = async (_h: unknown, evts: unknown[]) => {
    for (const e of evts as { type: string; actorId: string | null; payload: Record<string, unknown> }[]) appended.push(e);
  };
  const events = {
    append: vi.fn(async (evts: unknown[]) => capture(null, evts)),
    appendWithClient: vi.fn(capture),
  } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());
  const service = new ProjectService(
    store, events, new NullTxRunner(), bus, null, null,
    { readProjectCommissioningReadiness: async () => ({ systems: 1, commissioned: 1 }) },
    { assess: async () => ({ ready: true }) },
  );
  service.onModuleInit();
  return { service, store, appended };
}

/**
 * Seed a project in a given state.
 *
 * Written through the store rather than `service.create`, because creation is itself governed now:
 * a project may only be CREATED in a pre-execution state, and reaching `active` or `closeout` is a
 * transition with conditions. These tests are about what cancellation records, not about how a
 * project arrived where it is, so they place the row directly and say so.
 */
const aProject = async (store: InMemoryProjectStore, status: ProjectStatus = 'planned') => {
  const project = makeProject({ tenantId: 't1', title: 'Tower A', createdBy: 'u1', status });
  await store.create(project);
  return project;
};

describe('cancelling a project', () => {
  it('refuses without a reason', async () => {
    const { service, store } = buildService();
    const p = await aProject(store);
    await expect(service.cancel({ projectId: p.id, actorId: 'u-pm', reason: '' })).rejects.toThrow('requires a reason');
  });

  it('refuses a reason that is only whitespace', async () => {
    // An empty string in an audit trail is worse than a missing field: it looks like an answer.
    const { service, store } = buildService();
    const p = await aProject(store);
    await expect(service.cancel({ projectId: p.id, actorId: 'u-pm', reason: '   ' })).rejects.toThrow('requires a reason');
  });

  it('refuses without an actor', async () => {
    const { service, store } = buildService();
    const p = await aProject(store);
    await expect(
      service.cancel({ projectId: p.id, actorId: '' as never, reason: 'Client withdrew funding' }),
    ).rejects.toThrow('requires the actor');
  });

  it('leaves the project untouched when it refuses', async () => {
    // The refusal must not be half a cancellation.
    const { service, store, appended } = buildService();
    const p = await aProject(store);
    await expect(service.cancel({ projectId: p.id, actorId: 'u-pm', reason: '' })).rejects.toThrow();
    expect((await store.get(p.id))?.status).toBe('planned');
    expect(appended.filter((e) => e.type === 'projects.project.cancelled')).toHaveLength(0);
  });

  it('records who, why, and what the project was doing when it stopped', async () => {
    const { service, store, appended } = buildService();
    const p = await aProject(store, 'active');

    const cancelled = await service.cancel({ projectId: p.id, actorId: 'u-pm', reason: 'Client withdrew funding' });

    expect(cancelled.status).toBe('cancelled');
    expect((await store.get(p.id))?.status).toBe('cancelled');

    const event = appended.find((e) => e.type === 'projects.project.cancelled');
    expect(event, 'a cancellation must emit its own event, not a generic update').toBeDefined();
    expect(event?.actorId).toBe('u-pm');
    expect(event?.payload.reason).toBe('Client withdrew funding');
    // `status` alone would lose this: everything cancelled reads `cancelled`, and the question
    // anyone asks later is what it was before.
    expect(event?.payload.fromStatus).toBe('active');
    expect(event?.payload.cancelledBy).toBe('u-pm');
    expect(event?.payload.cancelledAt).toEqual(expect.any(String));
    expect(event?.payload.title).toBe('Tower A');
  });

  it('trims the reason rather than storing the whitespace around it', async () => {
    const { service, store, appended } = buildService();
    const p = await aProject(store);
    await service.cancel({ projectId: p.id, actorId: 'u-pm', reason: '  Site handed to another contractor  ' });
    expect(appended.find((e) => e.type === 'projects.project.cancelled')?.payload.reason)
      .toBe('Site handed to another contractor');
  });

  it('is available from every live state, whatever the facts say', async () => {
    for (const from of ['planned', 'planning', 'active', 'testing', 'handover', 'closeout']) {
      const { service, store } = buildService();
      const p = await aProject(store, from as ProjectStatus);
      const cancelled = await service.cancel({ projectId: p.id, actorId: 'u-pm', reason: `stopped during ${from}` });
      expect(cancelled.status, `cancelling from ${from}`).toBe('cancelled');
    }
  });

  it('refuses to cancel what is already finished', async () => {
    const { service, store } = buildService();
    const p = await aProject(store, 'completed');
    await expect(service.cancel({ projectId: p.id, actorId: 'u-pm', reason: 'too late' }))
      .rejects.toThrow('a project cannot move from completed to cancelled');
  });

  it('is the ONLY way in: changeStatus will not carry a cancellation', async () => {
    // The point of the whole arrangement. If the ungoverned road stayed open it would be the one
    // taken, and the actor and reason would exist only in the method nobody called.
    const { service, store, appended } = buildService();
    const p = await aProject(store, 'active');

    await expect(service.changeStatus(p.id, 'cancelled')).rejects.toThrow('use the cancel command');
    expect((await store.get(p.id))?.status).toBe('active');
    expect(appended.filter((e) => e.type === 'projects.project.cancelled')).toHaveLength(0);
  });

  it('is not reachable as a generic field update either', async () => {
    const { service, store } = buildService();
    const p = await aProject(store, 'active');
    await expect(service.update(p.id, { status: 'cancelled' })).rejects.toThrow('governed status command');
  });
});
