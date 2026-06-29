import { describe, it, expect, vi } from 'vitest';
import {
  CommandBus,
  IdempotencyService,
  LockService,
  NullTxRunner,
  type EventStore,
  type AccessService,
} from '@aura/core';
import { AccountService } from './account.service';
import { InMemoryAccountStore } from './in-memory-account-store';

/**
 * Reference integration test for the kernel command pipeline (Constitution Law #2):
 * CRM account creation dispatched through a REAL CommandBus (validate → authz →
 * idempotency → NullTxRunner transaction → atomic store + outbox event).
 */
function buildService() {
  const store = new InMemoryAccountStore();
  const events = {
    append: vi.fn().mockResolvedValue(undefined),
    appendWithClient: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  // Real pipeline pieces; null pool / null tx exercise the in-memory fallbacks.
  const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());
  const service = new AccountService(store, events, bus);
  service.onModuleInit(); // register the command definition
  return { service, store, events, access };
}

describe('CRM account create via CommandBus', () => {
  it('dispatches through the pipeline: persists, emits, and authorizes', async () => {
    const { service, store, events, access } = buildService();

    const account = await service.create({ tenantId: 't1', name: 'Acme', createdBy: 'u1' });

    expect(account.name).toBe('Acme');
    expect(await store.get(account.id)).not.toBeNull();
    expect(events.appendWithClient).toHaveBeenCalledOnce();
    // The bus enforced the permission because an actor was present.
    expect(access.assert).toHaveBeenCalled();
  });

  it('runs the validation stage (rejects an empty name)', async () => {
    const { service } = buildService();
    await expect(
      service.create({ tenantId: 't1', name: '   ' } as unknown as Parameters<typeof service.create>[0]),
    ).rejects.toThrow('account name is required');
  });

  it('is idempotent: the same key returns the cached result and writes once', async () => {
    const { service, store } = buildService();

    const first = await service.create({ tenantId: 't1', name: 'Acme', createdBy: 'u1' }, 'key-123');
    const replay = await service.create({ tenantId: 't1', name: 'Acme', createdBy: 'u1' }, 'key-123');

    expect(replay.id).toBe(first.id); // cached replay, handler not re-run
    const all = await store.list({ tenantId: 't1' });
    expect(all.length).toBe(1); // only one persisted write
  });
});
