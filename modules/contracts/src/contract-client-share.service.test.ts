import { describe, expect, it, vi } from 'vitest';
import { ContractClientShareService } from './contract-client-share.service';
import { InMemoryContractClientShareStore } from './in-memory-contract-client-share-store';
import { ContractRevisionService } from './contract-revision.service';
import { InMemoryContractRevisionStore } from './in-memory-contract-revision-store';
import { ContractService } from './contract.service';
import { InMemoryContractStore } from './in-memory-contract-store';
import { CommandBus, IdempotencyService, LockService, NullTxRunner, type AccessService, type EventStore } from '@aura/core';

function build() {
  const events = { append: vi.fn().mockResolvedValue(undefined), appendWithClient: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());
  const contracts = new ContractService(new InMemoryContractStore(), events, new NullTxRunner(), bus, access); contracts.onModuleInit();
  const revisions = new ContractRevisionService(new InMemoryContractRevisionStore(), events, contracts);
  const shares = new ContractClientShareService(new InMemoryContractClientShareStore(), events, revisions);
  return { contracts, revisions, shares, events };
}

describe('contract client share service', () => {
  it('makes dispatch replay idempotent without a duplicate event', async () => {
    const { contracts, revisions, shares, events } = build();
    const contract = await contracts.create({ tenantId: 't1', title: 'Share contract', value: 0, createdBy: 'author' });
    const revision = await revisions.create({ tenantId: 't1', contractId: contract.id, createdBy: 'author' });
    const share = await shares.create({ tenantId: 't1', contractId: contract.id, revisionId: revision.id, recipient: 'client@example.test', method: 'download' });
    const first = await shares.dispatch(share.id);
    const second = await shares.dispatch(share.id);
    expect(first.state).toBe('dispatched');
    expect(second).toEqual(first);
    const appended = (events.append as unknown as { mock: { calls: Array<Array<Array<{ type?: string }>>> } }).mock.calls.flat(2);
    expect(appended.filter((event) => event.type === 'contracts.contract.client_share.dispatched')).toHaveLength(1);
  });
});
