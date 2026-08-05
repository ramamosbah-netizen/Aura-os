import { describe, it, expect, vi } from 'vitest';
import {
  CommandBus,
  IdempotencyService,
  LockService,
  NullTxRunner,
  type EventStore,
  type AccessService,
} from '@aura/core';
import { ContractService } from './contract.service';
import { InMemoryContractStore } from './in-memory-contract-store';

/** Contracts create dispatched through a REAL kernel CommandBus pipeline. */
function buildService() {
  const store = new InMemoryContractStore();
  const events = {
    append: vi.fn().mockResolvedValue(undefined),
    appendWithClient: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());
  const service = new ContractService(store, events, new NullTxRunner(), bus, access);
  service.onModuleInit();
  return { service, store, events };
}

describe('Contracts create via CommandBus', () => {
  it('persists the contract and emits its event through the pipeline', async () => {
    const { service, store, events } = buildService();
    const contract = await service.create({ tenantId: 't1', title: 'EPC Contract', createdBy: 'u1' });
    expect(contract.title).toBe('EPC Contract');
    expect(await store.get(contract.id)).not.toBeNull();
    expect(events.appendWithClient).toHaveBeenCalledOnce();
  });

  it('runs the validation stage (rejects an empty title)', async () => {
    const { service } = buildService();
    await expect(
      service.create({ tenantId: 't1', title: '  ' } as unknown as Parameters<typeof service.create>[0]),
    ).rejects.toThrow('contract title is required');
  });

  it('records a before→after value diff on update (audit trail P1-2)', async () => {
    const { service, events } = buildService();
    const c = await service.create({ tenantId: 't1', title: 'EPC', createdBy: 'u1' }); // value defaults 0
    await service.update(c.id, { value: 150000, title: 'EPC Rev A' });
    const emitted = (events.appendWithClient as any).mock.calls.flatMap((args: unknown[]) => (args[1] as unknown[]) ?? []);
    const upd = emitted.find((e: any) => e?.payload?.changes);
    expect(upd.payload.changes.value).toEqual({ from: 0, to: 150000 });
    expect(upd.payload.changes.title).toEqual({ from: 'EPC', to: 'EPC Rev A' });
  });
});
