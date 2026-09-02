import { describe, expect, it, vi } from 'vitest';
import { InMemoryContractApprovalStore } from './in-memory-contract-approval-store';
import { ContractApprovalService } from './contract-approval.service';

const events = { append: vi.fn(async () => undefined) } as any;
const audit = { log: vi.fn(async () => undefined) } as any;
const access = { assert: vi.fn(() => undefined) } as any;
const tenant = { boundTenantId: () => 't1' } as any;

describe('ContractApprovalService', () => {
  it('persists a pending approval, rejects self-approval, and accepts a different approver', async () => {
    const svc = new ContractApprovalService(new InMemoryContractApprovalStore(), events, access, null, audit, tenant);
    const submitted = await svc.submit({ tenantId: 't1', contractId: 'c1', target: 'revision', targetId: 'r1', actorId: 'author' });
    expect(submitted.status).toBe('pending');
    await expect(svc.decide('revision', 'r1', 'approved', 'author')).rejects.toThrow(/cannot approve/);
    const approved = await svc.decide('revision', 'r1', 'approved', 'approver', 'ok');
    expect(approved.status).toBe('approved');
    expect(events.append).toHaveBeenCalledTimes(2);
    expect(audit.log).toHaveBeenCalledTimes(2);
  });

  it('is idempotent for repeated submission and rejects conflicting decisions', async () => {
    const svc = new ContractApprovalService(new InMemoryContractApprovalStore(), events, access, null, null, tenant);
    const a = await svc.submit({ tenantId: 't1', contractId: 'c1', target: 'amendment', targetId: 'a1', actorId: 'maker' });
    const replay = await svc.submit({ tenantId: 't1', contractId: 'c1', target: 'amendment', targetId: 'a1', actorId: 'maker' });
    expect(replay.id).toBe(a.id);
    await svc.decide('amendment', 'a1', 'rejected', 'checker');
    await expect(svc.decide('amendment', 'a1', 'approved', 'checker')).rejects.toThrow(/already decided/);
  });

  it('collapses concurrent submissions to one canonical approval', async () => {
    class RaceStore extends InMemoryContractApprovalStore {
      override async create(a: any) { await Promise.resolve(); return super.create(a); }
    }
    const svc = new ContractApprovalService(new RaceStore(), events, access, null, null, tenant);
    const [left, right] = await Promise.all([
      svc.submit({ tenantId: 't1', contractId: 'c1', target: 'revision', targetId: 'race', actorId: 'maker' }),
      svc.submit({ tenantId: 't1', contractId: 'c1', target: 'revision', targetId: 'race', actorId: 'maker' }),
    ]);
    expect(left.id).toBe(right.id);
    expect(left.status).toBe('pending');
  });
});
