import { describe, expect, it, vi } from 'vitest';
import { ContractRevisionService } from './contract-revision.service';
import { InMemoryContractRevisionStore } from './in-memory-contract-revision-store';
import { InMemoryContractStore } from './in-memory-contract-store';
import { ContractService } from './contract.service';
import { CommandBus, IdempotencyService, LockService, NullTxRunner, type AccessService, type EventStore } from '@aura/core';

function build() {
  const contracts = new InMemoryContractStore();
  const events = { append: vi.fn().mockResolvedValue(undefined), appendWithClient: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const access = { assert: vi.fn() } as unknown as AccessService;
  const bus = new CommandBus(access, new IdempotencyService(null), new LockService(), new NullTxRunner());
  const contractService = new ContractService(contracts, events, new NullTxRunner(), bus, access); contractService.onModuleInit();
  const revisions = new ContractRevisionService(new InMemoryContractRevisionStore(), events, contractService);
  return { contractService, revisions, events };
}

describe('contract CLM revisions', () => {
  it('snapshots revisions with parent lineage and protects signed state', async () => {
    const { contractService, revisions } = build();
    const c = await contractService.create({ tenantId: 't1', title: 'CLM Contract', value: 0, createdBy: 'author' });
    const r1 = await revisions.create({ tenantId: 't1', contractId: c.id, terms: { paymentDays: 30 }, clauses: [{ id: 'clause-1', revisionId: 'ignored', sourceClauseId: 'library-1', sourceClauseRevision: 2, code: 'PAY', title: 'Payment', category: 'payment', body: '30 days', createdAt: 'ignored' }], createdBy: 'author' });
    expect(r1.clauses[0].revisionId).toBe(r1.id);
    const r2 = await revisions.create({ tenantId: 't1', contractId: c.id, parentRevisionId: r1.id, terms: { paymentDays: 45 }, createdBy: 'author' });
    expect(r2.revisionNumber).toBe(2);
    expect(r2.parentRevisionId).toBe(r1.id);
    await revisions.transition(r2.id, 'internal_review', 'reviewer');
    await revisions.transition(r2.id, 'negotiation', 'reviewer');
    const approved = await revisions.transition(r2.id, 'approved', 'approver');
    expect(approved.approvedBy).toBe('approver');
    expect(approved.approvedAt).toEqual(expect.any(String));
    const signed = await revisions.transition(r2.id, 'signed', 'signer');
    expect(signed.signedBy).toBe('signer');
    await expect(revisions.transition(r2.id, 'draft', 'author')).rejects.toThrow(/invalid contract revision transition/);
  });

  it('rejects a revision for a different tenant contract', async () => {
    const { contractService, revisions } = build();
    const c = await contractService.create({ tenantId: 'tenant-a', title: 'A', value: 0 });
    await expect(revisions.create({ tenantId: 'tenant-b', contractId: c.id })).rejects.toThrow(/another tenant/);
  });

  it('rejects a revision addressed through a different contract URL', async () => {
    const { contractService, revisions } = build();
    const first = await contractService.create({ tenantId: 't1', title: 'First', value: 0, createdBy: 'u1' });
    const second = await contractService.create({ tenantId: 't1', title: 'Second', value: 0, createdBy: 'u1' });
    const revision = await revisions.create({ tenantId: 't1', contractId: first.id, createdBy: 'u1' });
    await expect(revisions.transitionForContract(second.id, revision.id, 'internal_review', 'u1')).rejects.toThrow(/does not belong/);
  });

  it('enforces segregation of duties for revision approval', async () => {
    const { contractService, revisions } = build();
    const c = await contractService.create({ tenantId: 't1', title: 'SoD', value: 0, createdBy: 'author' });
    const r = await revisions.create({ tenantId: 't1', contractId: c.id, createdBy: 'author' });
    await revisions.transition(r.id, 'internal_review', 'reviewer');
    await revisions.transition(r.id, 'negotiation', 'reviewer');
    await expect(revisions.transition(r.id, 'approved', 'author')).rejects.toThrow(/cannot approve/);
    await expect(revisions.transition(r.id, 'approved', null)).rejects.toThrow(/requires an actor/);
    await expect(revisions.transition(r.id, 'approved', 'approver')).resolves.toMatchObject({ status: 'approved' });
  });
});
