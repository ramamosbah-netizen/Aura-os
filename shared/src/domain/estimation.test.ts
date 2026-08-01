import { describe, it, expect } from 'vitest';
import { estimateLine, sellFromMargin, emptyEstimationInput, type EstimationInput } from './estimation';

const base = (over: Partial<EstimationInput> = {}): EstimationInput => ({
  ...emptyEstimationInput(),
  quantity: 4,
  materialUnitCost: 480,
  labour: { hoursPerUnit: 2, crewSize: 2, hourlyRate: 30 },
  targetMarginPercent: 25,
  ...over,
});

describe('estimateLine', () => {
  it('builds material + labour into a direct cost, then prices to the target margin', () => {
    const r = estimateLine(base());
    // material 4×480 = 1920; labour 2h×4 = 8h × 30 = 240; direct 2160.
    expect(r.materialCost).toBe(1920);
    expect(r.labourCost).toBe(240);
    expect(r.directCost).toBe(2160);
    // no loadings → total = direct; sell at 25% margin = 2160 / 0.75 = 2880.
    expect(r.totalCost).toBe(2160);
    expect(r.sellPrice).toBe(2880);
    expect(r.marginPercent).toBe(25);
  });

  it('applies wastage to materials', () => {
    const r = estimateLine(base({ wastagePercent: 10 }));
    expect(r.materialCost).toBe(2112); // 1920 × 1.1
  });

  it('computes install DURATION from man-hours and crew, not from cost', () => {
    // 8 man-hours, crew of 2 → 8 / (2×8) = 0.5 days. Same cost whatever the crew.
    const two = estimateLine(base({ labour: { hoursPerUnit: 2, crewSize: 2, hourlyRate: 30 } }));
    const four = estimateLine(base({ labour: { hoursPerUnit: 2, crewSize: 4, hourlyRate: 30 } }));
    expect(two.labourHours).toBe(8);
    expect(two.installDurationDays).toBe(0.5);
    expect(four.installDurationDays).toBe(0.25); // twice the crew, half the days
    expect(four.labourCost).toBe(two.labourCost); // ...but the same cost
  });

  it('loads overhead, risk, warranty and contingency each on the direct cost', () => {
    const r = estimateLine(base({ overheadPercent: 10, riskPercent: 5, warrantyPercent: 2, contingencyPercent: 3 }));
    // direct 2160; loadings: 216 + 108 + 43.2 + 64.8 = 432; total 2592.
    expect(r.overheadCost).toBe(216);
    expect(r.riskCost).toBe(108);
    expect(r.warrantyCost).toBe(43.2);
    expect(r.contingencyCost).toBe(64.8);
    expect(r.totalCost).toBe(2592);
  });

  it('reports per-unit cost and sell', () => {
    const r = estimateLine(base());
    expect(r.unitCost).toBe(540); // 2160 / 4
    expect(r.unitSellPrice).toBe(720); // 2880 / 4
  });

  it('handles zero margin (sell = cost) and zero quantity without dividing by zero', () => {
    expect(estimateLine(base({ targetMarginPercent: 0 })).sellPrice).toBe(2160);
    const empty = estimateLine(base({ quantity: 0 }));
    expect(empty.unitCost).toBe(0);
    expect(empty.totalCost).toBe(0);
  });

  it('clamps negative inputs to zero rather than producing nonsense', () => {
    const r = estimateLine(base({ materialUnitCost: -100 }));
    expect(r.materialCost).toBe(0);
  });
});

describe('sellFromMargin', () => {
  it('lifts a cost to the target margin on sell', () => {
    expect(sellFromMargin(750, 25)).toBe(1000);
    expect(sellFromMargin(1000, 0)).toBe(1000);
  });
  it('caps margin below 100% so it never divides by zero', () => {
    expect(sellFromMargin(100, 150)).toBeGreaterThan(100);
    expect(Number.isFinite(sellFromMargin(100, 100))).toBe(true);
  });
});
