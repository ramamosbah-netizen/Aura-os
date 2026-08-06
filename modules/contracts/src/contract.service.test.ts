import { describe, it, expect, vi } from 'vitest';
import type { EventStore, TxRunner, AccessService } from '@aura/core';
import { ContractService } from './contract.service';
import { InMemoryContractStore } from './in-memory-contract-store';
import { makeContract } from './domain/contract';

// contract.changeStatus emits `signed` (→ auto-creates the delivery Project) and `completed`
// (→ completion reactors). Re-emitting either duplicates that automation, so the status setter
// must be idempotent on the same status and refuse invalid moves.

const tx = { run: async (fn: (h: unknown) => Promise<void>) => fn(null) } as unknown as TxRunner;
const access = { assert: () => {}, assertApprovalAuthority: () => {} } as unknown as AccessService;
const commands = { register: () => {} } as unknown as never;

function harness() {
  const store = new InMemoryContractStore();
  const appendWithClient = vi.fn().mockResolvedValue(undefined);
  const events = { append: vi.fn().mockResolvedValue(undefined), appendWithClient } as unknown as EventStore;
  const svc = new ContractService(store, events, tx, commands, access);
  const emitted = () => appendWithClient.mock.calls.flatMap((c) => (c[1] as Array<{ type: string }>).map((e) => e.type));
  const seed = async (status: 'draft' | 'active' = 'draft') => {
    const c = makeContract({ tenantId: 't1', title: 'Mall ELV', value: 100_000, status });
    await store.create(c);
    return c;
  };
  return { store, svc, appendWithClient, emitted, seed };
}

describe('ContractService — lifecycle state machine', () => {
  it('re-activating an already-active contract is a no-op — no second `signed` (no duplicate project)', async () => {
    const { svc, appendWithClient, emitted, seed } = harness();
    const c = await seed('draft');
    await svc.changeStatus(c.id, 'active');
    expect(emitted()).toContain('contracts.contract.signed');

    appendWithClient.mockClear();
    const again = await svc.changeStatus(c.id, 'active'); // idempotent no-op
    expect(again.status).toBe('active');
    expect(emitted()).not.toContain('contracts.contract.signed'); // would have auto-created a 2nd project
  });

  it('re-completing an already-completed contract is a no-op — no second reactor fire', async () => {
    const { svc, appendWithClient, emitted, seed } = harness();
    const c = await seed('active');
    await svc.changeStatus(c.id, 'completed');
    expect(emitted()).toContain('contracts.contract.completed');

    appendWithClient.mockClear();
    await svc.changeStatus(c.id, 'completed');
    expect(emitted()).not.toContain('contracts.contract.completed');
  });

  it('refuses an invalid transition (completed → active, active → draft)', async () => {
    const { svc, seed } = harness();
    const c = await seed('active');
    await svc.changeStatus(c.id, 'completed');
    await expect(svc.changeStatus(c.id, 'active')).rejects.toThrow(/can only move to/i);

    const d = await seed('active');
    await expect(svc.changeStatus(d.id, 'draft')).rejects.toThrow(/can only move to/i);
  });

  it('a value change re-asserts the signing ceiling — you cannot patch past your approval limit', async () => {
    const store = new InMemoryContractStore();
    const events = { append: vi.fn().mockResolvedValue(undefined), appendWithClient: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
    // An approver capped at 50k: authorised for the action, but not for the amount.
    const capped = {
      assert: () => {},
      assertApprovalAuthority: (_u: string, t: { amount: number }) => {
        if (t.amount > 50_000) throw new Error('Access denied: above your approval limit');
      },
    } as unknown as AccessService;
    const tenant = { get: () => ({ tenantId: 't1', companyId: null, actorId: 'limited-approver' }) } as never;
    const svc = new ContractService(store, events, tx, commands, capped, tenant);
    const c = makeContract({ tenantId: 't1', title: 'Small works', value: 30_000, status: 'active' });
    await store.create(c);

    await expect(svc.update(c.id, { value: 5_000_000 })).rejects.toThrow(/above your approval limit/i);
    expect((await store.get(c.id))?.value).toBe(30_000); // unchanged — the AR cap is not raised
    await svc.update(c.id, { value: 45_000 }); // within the ceiling → allowed
    expect((await store.get(c.id))?.value).toBe(45_000);
  });

  it('freezes the value of a closed contract', async () => {
    const { svc, seed } = harness();
    const c = await seed('active');
    await svc.changeStatus(c.id, 'completed');
    await expect(svc.update(c.id, { value: 250_000 })).rejects.toThrow(/cannot change the value of a completed contract/i);
    await svc.update(c.id, { title: 'Mall ELV (final)' }); // non-value fields stay editable
  });

  it('still runs the happy path draft → active → completed, emitting each trigger once', async () => {
    const { svc, emitted, seed } = harness();
    const c = await seed('draft');
    await svc.changeStatus(c.id, 'active');
    await svc.changeStatus(c.id, 'completed');
    const types = emitted();
    expect(types.filter((t) => t === 'contracts.contract.signed')).toHaveLength(1);
    expect(types.filter((t) => t === 'contracts.contract.completed')).toHaveLength(1);
  });
});
