import { describe, it, expect } from 'vitest';
import { computeBuildUp, type CostComponent } from './estimation-core';

// CHARACTERIZATION TESTS — written BEFORE the Slice 6A engine split, deliberately.
//
// These numbers were MEASURED from the engine as it stood at commit dff3fdb4, not derived by hand.
// They exist for one purpose: to prove the cost/commercial split changes nothing for the existing
// caller. Tendering's submission gate defines "priced" as sellingRate > 0, its CSV export carries
// sellingRate, and its tender value rolls up from it — so a single cent of drift here is a
// production defect, not a rounding detail.
//
// If a change makes one of these fail, the change is wrong unless the drift is deliberate and the
// golden value is updated in the same commit with a stated reason.

const comp = (costType: CostComponent['costType'], amount: number): CostComponent => ({
  costType, description: costType, quantity: 1, unitCost: amount, amount,
});

describe('computeBuildUp — golden values (pre-split behaviour, measured)', () => {
  it('plain: 800 direct, 10% overhead, 15% profit', () => {
    expect(computeBuildUp([comp('material', 800)], 10, 15, 0, 0)).toEqual({
      directCost: 800, indirectAmount: 0, overheadAmount: 80, riskAmount: 0,
      profitAmount: 132, sellingRate: 1012,
    });
  });

  it('T3 full loadings: 1000 direct, ind 5%, oh 10%, risk 7.5%, profit 20%', () => {
    expect(computeBuildUp([comp('material', 1000)], 10, 20, 5, 7.5)).toEqual({
      directCost: 1000, indirectAmount: 50, overheadAmount: 100, riskAmount: 86.25,
      profitAmount: 247.25, sellingRate: 1483.5,
    });
  });

  it('multi-component across cost types', () => {
    const components: CostComponent[] = [
      { costType: 'material', description: 'm', quantity: 2, unitCost: 150, amount: 300 },
      { costType: 'labour', description: 'l', quantity: 4, unitCost: 55, amount: 220 },
      { costType: 'plant', description: 'p', quantity: 1, unitCost: 90, amount: 90 },
    ];
    expect(computeBuildUp(components, 12.5, 18, 6, 4)).toEqual({
      directCost: 610, indirectAmount: 36.6, overheadAmount: 76.25, riskAmount: 28.91,
      profitAmount: 135.32, sellingRate: 887.08,
    });
  });

  it('zero loadings: the selling rate is the direct cost', () => {
    expect(computeBuildUp([comp('other', 500)], 0, 0, 0, 0)).toEqual({
      directCost: 500, indirectAmount: 0, overheadAmount: 0, riskAmount: 0,
      profitAmount: 0, sellingRate: 500,
    });
  });

  it('rounding-sensitive: per-step rounding must not drift', () => {
    // 99.99 × 3.3% = 3.29967 → 3.3 ; × 7.7% = 7.699 → 7.7 ; risk on 110.99 ; profit on 113.43.
    // A split that rounds at different points produces 128.51 or 128.53 here.
    expect(computeBuildUp([comp('material', 99.99)], 7.7, 13.3, 3.3, 2.2)).toEqual({
      directCost: 99.99, indirectAmount: 3.3, overheadAmount: 7.7, riskAmount: 2.44,
      profitAmount: 15.09, sellingRate: 128.52,
    });
  });
});

describe('computeBuildUp — the cost/commercial seam is already exact', () => {
  /**
   * The split is only safe because the engine ALREADY computes profit on
   * (direct + indirect + overhead + risk) — the exact quantity Slice 6A names `estimatedCost`.
   * This test pins that identity, so the seam cannot silently move.
   */
  it('profit is computed on direct + indirect + overhead + risk, and selling = that + profit', () => {
    for (const [oh, pr, ind, risk] of [[10, 15, 0, 0], [10, 20, 5, 7.5], [12.5, 18, 6, 4], [7.7, 13.3, 3.3, 2.2]]) {
      const f = computeBuildUp([comp('material', 1000)], oh, pr, ind, risk);
      const estimatedCost = f.directCost + f.indirectAmount + f.overheadAmount + f.riskAmount;
      expect(f.sellingRate).toBe(Math.round((estimatedCost + f.profitAmount) * 100) / 100);
      expect(f.profitAmount).toBe(Math.round(estimatedCost * (pr / 100) * 100) / 100);
    }
  });
});
