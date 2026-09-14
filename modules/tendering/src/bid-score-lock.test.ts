import { describe, expect, it } from 'vitest';
import { InMemoryBidScoreStore } from './in-memory-bid-score-store';
import { makeBidScore } from './domain/bid-score';
import { BidScoreLockedError } from './bid-score-store';

const decision = (tenantId = 'tenant-a', score = 8) => makeBidScore({ tenantId, tenderId: 'tender-a', criteria: [{ name: 'Fit', weight: 2, score }], createdBy: 'reviewer', decidedBy: 'reviewer' });

describe('confirmed tender qualification', () => {
  it('rejects a replacement and a same-id overwrite, retaining the original decision', async () => {
    const store = new InMemoryBidScoreStore();
    const original = decision();
    await store.save(original);
    await expect(store.save(decision('tenant-a', 1))).rejects.toBeInstanceOf(BidScoreLockedError);
    await expect(store.save({ ...original, notes: 'changed' })).rejects.toBeInstanceOf(BidScoreLockedError);
    expect(await store.get(original.id)).toEqual(original);
  });
  it('accepts exactly one concurrent confirmation and isolates tenants', async () => {
    const store = new InMemoryBidScoreStore();
    const results = await Promise.allSettled([store.save(decision()), store.save(decision('tenant-a', 1))]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await store.save(decision('tenant-b'));
    expect(await store.list({ tenantId: 'tenant-a' })).toHaveLength(1);
    expect(await store.list({ tenantId: 'tenant-b' })).toHaveLength(1);
  });
  it('does not allow rating changes through mutable input or read references', async () => {
    const store = new InMemoryBidScoreStore();
    const original = decision();
    await store.save(original);
    original.criteria[0].score = 0;
    const fetched = (await store.get(original.id))!;
    fetched.criteria[0].score = 1;
    const listed = await store.list();
    listed[0].criteria[0].weight = 0;
    expect((await store.get(original.id))!.criteria).toEqual([{ name: 'Fit', weight: 2, score: 8 }]);
  });
  it('creates a new locked decision for a governed amendment and preserves the original', async () => {
    const store = new InMemoryBidScoreStore();
    const original = decision();
    await store.save(original);
    const replacement = makeBidScore({
      tenantId: original.tenantId,
      tenderId: original.tenderId,
      criteria: [{ name: 'Fit', weight: 2, score: 2 }],
      decidedBy: 'manager', createdBy: 'manager', supersedesId: original.id,
      amendmentReason: 'Client removed the required authority approval evidence',
    });
    await store.amend(original.id, replacement, 'manager');
    expect(await store.get(original.id)).toMatchObject({
      recommendation: original.recommendation,
      criteria: original.criteria,
      supersededBy: 'manager',
    });
    expect((await store.get(original.id))!.supersededAt).toBe(replacement.createdAt);
    expect(await store.get(replacement.id)).toMatchObject({
      supersedesId: original.id,
      amendmentReason: 'Client removed the required authority approval evidence',
      supersededAt: null,
    });
    await expect(store.save(decision('tenant-a', 9))).rejects.toBeInstanceOf(BidScoreLockedError);
  });
  it('allows only one concurrent amendment of the current decision', async () => {
    const store = new InMemoryBidScoreStore();
    const original = decision();
    await store.save(original);
    const next = (score: number) => makeBidScore({
      tenantId: original.tenantId, tenderId: original.tenderId,
      criteria: [{ name: 'Fit', weight: 2, score }], createdBy: 'manager', decidedBy: 'manager',
      supersedesId: original.id, amendmentReason: `Evidence revision ${score}`,
    });
    const results = await Promise.allSettled([
      store.amend(original.id, next(3), 'manager'),
      store.amend(original.id, next(4), 'manager'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await store.list({ tenantId: original.tenantId, tenderId: original.tenderId })).filter((row) => !row.supersededAt)).toHaveLength(1);
  });
});
