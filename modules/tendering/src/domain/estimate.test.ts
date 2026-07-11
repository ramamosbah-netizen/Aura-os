import { describe, expect, it } from 'vitest';
import { makeBOQ, makeBOQItem } from './boq';
import { compileResourceBreakdown, computeBuildUp, makeRateBuildUp, summariseEstimate, type NewRateBuildUp } from './estimate';

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

describe('resource breakdown sheet → components (internal pricing sheet)', () => {
  // The CCTV sheet shape: 10 cameras, AED 450 supply each, 2 techs × 16h @ 15,
  // 1 engineer × 8h @ 20, PM 4h @ 40, AED 300 transport, 2% wastage,
  // AED 200 accessories, no subcontract.
  const sheet = {
    supplyUnitPrice: 450,
    technician: { count: 2, hours: 16, rate: 15 },
    engineer: { count: 1, hours: 8, rate: 20 },
    projectManager: { count: 1, hours: 4, rate: 40 },
    transport: 300,
    wastagePercent: 2,
    accessories: 200,
    subcontract: 0,
  };

  it('compiles per-line figures into per-unit components (÷ BOQ qty)', () => {
    const { components } = compileResourceBreakdown(sheet, 10);
    const by = Object.fromEntries(components.map((c) => [c.description.split(' —')[0], c]));
    expect(by['Material supply']).toMatchObject({ costType: 'material', quantity: 1, unitCost: 450 });
    expect(by['Wastage 2%']).toMatchObject({ costType: 'material', unitCost: 9 }); // 2% of 450
    expect(by['Accessories & consumables']).toMatchObject({ costType: 'material', unitCost: 20 }); // 200/10
    expect(by['Technician']).toMatchObject({ costType: 'labour', quantity: 3.2, unitCost: 15 }); // 32h/10
    expect(by['Engineer']).toMatchObject({ costType: 'labour', quantity: 0.8, unitCost: 20 });
    expect(by['Project manager']).toMatchObject({ costType: 'labour', quantity: 0.4, unitCost: 40 });
    expect(by['Transport']).toMatchObject({ costType: 'plant', unitCost: 30 }); // 300/10
    expect(by['Subcontracted works']).toBeUndefined(); // zero blocks omitted
  });

  it('the compiled build-up prices the whole line correctly through the engine', () => {
    const { resources, components } = compileResourceBreakdown(sheet, 10);
    const b = makeRateBuildUp({ ...base, components, resources, overheadPercent: 0, profitPercent: 0 });
    // Per unit: 450 supply + 9 wastage + 20 accessories + 48 tech + 16 eng + 16 pm + 30 transport = 589
    expect(b.directCost).toBe(589);
    expect(b.sellingRate).toBe(589);
    expect(b.resources).toEqual(resources);
    // Line total over 10 units = the sheet's own line total:
    // 4500 supply + 90 wastage + 200 accessories + 480 tech + 160 eng + 160 pm + 300 transport = 5890
    expect(b.sellingRate * 10).toBe(5890);
  });

  it('rejects qty ≤ 0, negative figures, and an all-zero sheet', () => {
    expect(() => compileResourceBreakdown(sheet, 0)).toThrow(/quantity/);
    expect(() => compileResourceBreakdown({ ...sheet, transport: -5 }, 10)).toThrow(/negative/);
    expect(() => compileResourceBreakdown({}, 10)).toThrow(/no cost/);
  });
});
