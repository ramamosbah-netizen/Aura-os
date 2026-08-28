import { describe, expect, it, vi } from 'vitest';
import { AccessService, CommandBus, IdempotencyService, LockService, NullTxRunner, TenantContext, type EventStore } from '@aura/core';
import { ContactService } from './contact.service';
import { InMemoryContactStore } from './in-memory-contact-store';

function build() {
  const store = new InMemoryContactStore();
  const events = { append: vi.fn(), appendWithClient: vi.fn() } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());
  const service = new ContactService(store, events, new NullTxRunner(), bus, new TenantContext());
  service.onModuleInit();
  return { service, store, access };
}

describe('CRM contact integrity', () => {
  it('creates through the command bus and replays idempotently', async () => {
    const { service, store, access } = build();
    const first = await service.create({ tenantId: 't1', name: 'Layla', createdBy: 'u1' }, 'contact-key');
    const replay = await service.create({ tenantId: 't1', name: 'Layla', createdBy: 'u1' }, 'contact-key');
    expect(replay.id).toBe(first.id);
    expect((await store.list({ tenantId: 't1' })).length).toBe(1);
    expect(access.assert).toHaveBeenCalled();
  });

  it('rejects cross-account and self reporting relationships', async () => {
    const { service } = build();
    const manager = await service.create({ tenantId: 't1', accountId: 'a1', name: 'Manager' });
    const child = await service.create({ tenantId: 't1', accountId: 'a1', name: 'Child' });
    await expect(service.update(child.id, { reportsToId: manager.id })).resolves.toMatchObject({ reportsToId: manager.id });
    const other = await service.create({ tenantId: 't1', accountId: 'a2', name: 'Other' });
    await expect(service.update(child.id, { reportsToId: other.id })).rejects.toThrow(/same account/i);
    await expect(service.update(child.id, { reportsToId: child.id })).rejects.toThrow(/itself/i);
  });

  it('demotes a previous primary contact atomically in the service path', async () => {
    const { service, store } = build();
    const first = await service.create({ tenantId: 't1', accountId: 'a1', name: 'First', isPrimary: true });
    const second = await service.create({ tenantId: 't1', accountId: 'a1', name: 'Second' });
    await service.update(second.id, { isPrimary: true });
    expect((await store.get(first.id))?.isPrimary).toBe(false);
    expect((await store.get(second.id))?.isPrimary).toBe(true);
  });
});
