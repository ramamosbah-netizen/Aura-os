import { describe, expect, it, vi } from 'vitest';
import { CostLedgerService } from './cost-ledger.service';
import { InMemoryCostLedgerStore } from './in-memory-cost-ledger-store';
import type { CbsService } from './cbs.service';

// Durable idempotency (mig 0254) — the outbox replays a whole event on any subscriber failure, so a
// cost post must be safe to run twice. These prove `post` is idempotent on `dedupeKey`: the ledger
// gains ONE row and the CBS balance moves ONCE, no matter how many times the same keyed post lands.

const tenantId = 'tenant-ledger';

/** A CbsService stand-in that only counts the balance moves — the ledger service must call it once. */
function countingCbs() {
  const calls = { committed: 0, actual: 0, budget: 0, variationBudget: 0 };
  const cbs = {
    recordCommittedCost: vi.fn(async () => { calls.committed += 1; }),
    recordActualCost: vi.fn(async () => { calls.actual += 1; }),
    recordBudget: vi.fn(async () => { calls.budget += 1; }),
    recordApprovedVariationBudget: vi.fn(async () => { calls.variationBudget += 1; }),
  } as unknown as CbsService;
  return { cbs, calls };
}

describe('CostLedgerService.post — durable idempotency on dedupeKey', () => {
  it('a replayed keyed post appends ONE row and moves the CBS balance ONCE', async () => {
    const store = new InMemoryCostLedgerStore();
    const { cbs, calls } = countingCbs();
    const svc = new CostLedgerService(store, cbs);

    const input = {
      tenantId, projectId: 'p1', cbsNodeId: 'cbs1', type: 'actual' as const,
      amount: 1000, source: 'labour_timesheet' as const, dedupeKey: 'labour:evt-1',
    };
    const first = await svc.post(input);
    const second = await svc.post(input); // the outbox re-delivers the same event

    const rows = await store.list({ tenantId });
    expect(rows).toHaveLength(1);            // one ledger entry, not two
    expect(calls.actual).toBe(1);            // CBS balance moved exactly once
    expect(second.id).toBe(first.id);        // the replay returns the original transaction
  });

  it('different keys are different transactions; the CBS moves per distinct post', async () => {
    const store = new InMemoryCostLedgerStore();
    const { cbs, calls } = countingCbs();
    const svc = new CostLedgerService(store, cbs);

    await svc.post({ tenantId, projectId: 'p1', cbsNodeId: 'cbs1', type: 'actual', amount: 100, source: 'plant_usage', dedupeKey: 'plant:a' });
    await svc.post({ tenantId, projectId: 'p1', cbsNodeId: 'cbs1', type: 'actual', amount: 200, source: 'plant_usage', dedupeKey: 'plant:b' });

    expect(await store.list({ tenantId })).toHaveLength(2);
    expect(calls.actual).toBe(2);
  });

  it('an UNKEYED post keeps the legacy always-append behaviour (no accidental dedupe)', async () => {
    const store = new InMemoryCostLedgerStore();
    const { cbs, calls } = countingCbs();
    const svc = new CostLedgerService(store, cbs);

    const input = { tenantId, projectId: 'p1', cbsNodeId: 'cbs1', type: 'committed' as const, amount: 500, source: 'po' as const };
    await svc.post(input);
    await svc.post(input); // no dedupeKey → two distinct rows, as before

    expect(await store.list({ tenantId })).toHaveLength(2);
    expect(calls.committed).toBe(2);
  });

  it('the dedupe key is scoped per tenant — the same key in another tenant is a separate row', async () => {
    const store = new InMemoryCostLedgerStore();
    const { cbs } = countingCbs();
    const svc = new CostLedgerService(store, cbs);

    await svc.post({ tenantId, projectId: 'p1', cbsNodeId: 'cbs1', type: 'actual', amount: 100, source: 'labour_timesheet', dedupeKey: 'labour:evt-1' });
    await svc.post({ tenantId: 'tenant-other', projectId: 'p9', cbsNodeId: 'cbs9', type: 'actual', amount: 100, source: 'labour_timesheet', dedupeKey: 'labour:evt-1' });

    expect(await store.list({ tenantId })).toHaveLength(1);
    expect(await store.list({ tenantId: 'tenant-other' })).toHaveLength(1);
  });

  it('routes an approved variation budget entry through the explicit locked-baseline path', async () => {
    const store = new InMemoryCostLedgerStore();
    const { cbs, calls } = countingCbs();
    const svc = new CostLedgerService(store, cbs);

    await svc.post({ tenantId, projectId: 'p1', cbsNodeId: 'cbs1', type: 'budget', amount: 7000, source: 'variation', dedupeKey: 'variation:approved-1' });
    await svc.post({ tenantId, projectId: 'p1', cbsNodeId: 'cbs1', type: 'budget', amount: 7000, source: 'variation', dedupeKey: 'variation:approved-1' });

    expect(calls.variationBudget).toBe(1);
    expect(calls.budget).toBe(0);
    expect(await store.list({ tenantId })).toHaveLength(1);
  });
});
