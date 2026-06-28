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
  const service = new ProjectService(store, events, bus);
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
});
