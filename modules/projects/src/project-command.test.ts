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

/** Projects create dispatched through a REAL kernel CommandBus pipeline. */
function buildService() {
  const store = new InMemoryProjectStore();
  const events = {
    append: vi.fn().mockResolvedValue(undefined),
    appendWithClient: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());
  const service = new ProjectService(store, events, new NullTxRunner(), bus);
  service.onModuleInit();
  return { service, store, events };
}

describe('Projects create via CommandBus', () => {
  it('persists the project and emits its event through the pipeline', async () => {
    const { service, store, events } = buildService();
    const project = await service.create({ tenantId: 't1', title: 'Tower A', createdBy: 'u1' });
    expect(project.title).toBe('Tower A');
    expect(await store.get(project.id)).not.toBeNull();
    expect(events.appendWithClient).toHaveBeenCalledOnce();
  });

  it('runs the validation stage (rejects an empty title)', async () => {
    const { service } = buildService();
    await expect(
      service.create({ tenantId: 't1', title: '  ' } as unknown as Parameters<typeof service.create>[0]),
    ).rejects.toThrow('project title is required');
  });

  it('blocks generic status updates so completion uses the governed command', async () => {
    const { service } = buildService();
    const project = await service.create({ tenantId: 't1', title: 'Lifecycle proof', status: 'active', contractId: 'contract-1' });

    await expect(service.update(project.id, { status: 'completed' })).rejects.toThrow('governed status command');
  });

  it('preserves the governed completion event path', async () => {
    const { service, events } = buildService();
    const project = await service.create({ tenantId: 't1', title: 'Lifecycle proof', status: 'active', contractId: 'contract-1' });

    const updated = await service.changeStatus(project.id, 'completed');
    expect(updated.status).toBe('completed');
    const appendCalls = (events.append as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const lastEvent = appendCalls.at(-1)?.[0] as Array<{ type?: string }>;
    expect(lastEvent?.[0]?.type).toBe('projects.project.completed');
  });

  it('rejects original contract value changes after an immutable handover', async () => {
    const { service } = buildService();
    const project = await service.create({
      tenantId: 't1',
      title: 'Handed over project',
      value: 1_000,
      originalContractValue: 1_000,
      handoverId: 'handover-1',
      handoverSnapshotHash: 'hash-1',
      handoverLockedAt: new Date().toISOString(),
    });

    await expect(service.update(project.id, { value: 1_100 })).rejects.toThrow('immutable after handover');
  });
});
