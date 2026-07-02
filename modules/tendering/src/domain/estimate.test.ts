import { describe, expect, it } from 'vitest';
import { makeBOQ, makeBOQItem } from './boq';
import { computeBuildUp, makeRateBuildUp, summariseEstimate, type NewRateBuildUp } from './estimate';

const base: NewRateBuildUp = {
  tenantId: 't-1',
  tenderId: 'tender-1',
  boqItemId: 'item-1',
  components: [
    { costType: 'material', description: 'C30 concrete', quantity: 1.05, unitCost: 280 },
    { costType: 'labour', description: 'Pour gang', quantity: 0.8, unitCost: 45 },
    { costType: 'plant', description: 'Pump', quantity: 0.1, unitCost: 350 },
  ],
  overheadPercent: 10,
  profitPercent: 8,
};

describe('rate build-up engine', () => {
  it('computes component amounts, direct cost, overhead, profit and selling rate', () => {
    const b = makeRateBuildUp(base);
    // 1.05×280=294, 0.8×45=36, 0.1×350=35 → direct 365
    expect(b.components.map((c) => c.amount)).toEqual([294, 36, 35]);
    expect(b.directCost).toBe(365);
    expect(b.overheadAmount).toBe(36.5); // 10%
    expect(b.profitAmount).toBe(32.12); // 8% of 401.50
    expect(b.sellingRate).toBe(433.62);
  });

  it('zero percentages sell at direct cost', () => {
    const { sellingRate, directCost } = computeBuildUp(
      [{ costType: 'subcontract', description: 'NSC', quantity: 1, unitCost: 100, amount: 100 }],
      0,
      0,
    );
    expect(sellingRate).toBe(directCost);
  });

  it('rejects empty components, bad cost types and negative numbers', () => {
    expect(() => makeRateBuildUp({ ...base, components: [] })).toThrow(/component/);
    expect(() =>
      makeRateBuildUp({
        ...base,
        components: [{ costType: 'equipment' as never, description: 'x', quantity: 1, unitCost: 1 }],
      }),
    ).toThrow(/costType/);
    expect(() =>
      makeRateBuildUp({
        ...base,
        components: [{ costType: 'material', description: 'x', quantity: -1, unitCost: 1 }],
      }),
    ).toThrow(/negative/);
    expect(() => makeRateBuildUp({ ...base, overheadPercent: -5 })).toThrow(/negative/);
  });
});

describe('tender estimate summary', () => {
  it('extends build-ups by BOQ quantities and folds unpriced items', () => {
    const boq = makeBOQ({ tenantId: 't-1', tenderId: 'tender-1' });
    const priced = makeBOQItem({
      tenantId: 't-1', boqId: boq.id, itemCode: '1.1', description: 'Concrete', unit: 'm3', quantity: 100, rate: 400,
    });
    const unpriced = makeBOQItem({
      tenantId: 't-1', boqId: boq.id, itemCode: '1.2', description: 'Rebar', unit: 't', quantity: 10, rate: 2600,
    });
    const b = makeRateBuildUp({ ...base, boqItemId: priced.id });

    const est = summariseEstimate(boq.id, 'tender-1', [priced, unpriced], [b]);
    expect(est.itemCount).toBe(2);
    expect(est.estimatedItemCount).toBe(1);
    expect(est.directCostByType.material).toBe(29400); // 294 × 100
    expect(est.totalDirectCost).toBe(36500);
    expect(est.totalOverhead).toBe(3650);
    expect(est.totalProfit).toBe(3212);
    expect(est.totalSellingValue).toBe(43362);
    expect(est.unpricedBoqValue).toBe(26000); // 10 × 2600
    expect(est.estimatedTenderValue).toBe(69362);
    expect(est.marginPercent).toBeCloseTo(15.82, 2); // (3650+3212)/43362
  });

  it('empty BOQ → zeroed summary', () => {
    const est = summariseEstimate('boq-1', 'tender-1', [], []);
    expect(est.estimatedTenderValue).toBe(0);
    expect(est.marginPercent).toBe(0);
  });
});
