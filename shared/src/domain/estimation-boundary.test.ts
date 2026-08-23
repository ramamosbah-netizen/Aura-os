import { describe, it, expect } from 'vitest';
import {
  computeCostBuildUp, computeCommercialPricing, computeBuildUp,
  type CostComponent,
} from './estimation-core';

// Slice 6A — the Estimation / Pricing boundary.
//   Estimation = what will it cost us?   Pricing = what will we sell it for?
// See docs/reports/2026-08-24-estimation-pricing-domain-audit.md.

const comp = (amount: number): CostComponent => ({ costType: 'material', description: 'm', quantity: 1, unitCost: amount, amount });

describe('Layer 1 — computeCostBuildUp commits to a COST, never a price', () => {
  it('estimatedCost = direct + indirect + delivery overhead + risk', () => {
    const f = computeCostBuildUp([comp(1000)], { indirectPercent: 5, overheadPercent: 10, riskPercent: 7.5 });
    expect(f).toEqual({ directCost: 1000, indirectAmount: 50, overheadAmount: 100, riskAmount: 86.25, estimatedCost: 1236.25 });
  });

  it('exposes no selling figure at all — that is the point of the layer', () => {
    const f = computeCostBuildUp([comp(500)], { overheadPercent: 10 });
    expect(Object.keys(f).sort()).toEqual(['directCost', 'estimatedCost', 'indirectAmount', 'overheadAmount', 'riskAmount']);
    expect('sellingRate' in f).toBe(false);
    expect('profitAmount' in f).toBe(false);
  });

  it('with no loadings the estimated cost is the direct cost', () => {
    expect(computeCostBuildUp([comp(500)]).estimatedCost).toBe(500);
  });
});

describe('Layer 2 — markup and margin are NOT the same number', () => {
  /** The worked example that motivated making the convention explicit. */
  it('15% MARKUP on cost 100 sells at 115 and realises a 13.0435% margin', () => {
    const p = computeCommercialPricing(100, { method: 'markup', percent: 15 });
    expect(p.preDiscountSell).toBe(115);
    expect(p.sellingPrice).toBe(115);
    expect(p.grossProfit).toBe(15);
    expect(p.markupPercent).toBe(15);
    expect(p.marginPercent).toBe(13.0435);
    expect(p.pricingMethod).toBe('markup');
    expect(p.inputPercent).toBe(15);
  });

  it('15% TARGET MARGIN on cost 100 sells higher — 117.65, not 115', () => {
    const p = computeCommercialPricing(100, { method: 'target_margin', percent: 15 });
    // 100 / 0.85 = 117.6470588…, held to 2dp like every other money figure in the platform.
    expect(p.sellingPrice).toBe(117.65);
    expect(p.marginPercent).toBe(15.0021); // 2dp money rounding, surfaced rather than hidden
    expect(p.markupPercent).toBe(17.65);
    expect(p.pricingMethod).toBe('target_margin');
  });

  it('the two methods are only equal at 0%', () => {
    const markup = computeCommercialPricing(100, { method: 'markup', percent: 0 });
    const margin = computeCommercialPricing(100, { method: 'target_margin', percent: 0 });
    expect(markup.sellingPrice).toBe(100);
    expect(margin.sellingPrice).toBe(100);
    for (const pct of [5, 15, 30, 50]) {
      expect(computeCommercialPricing(100, { method: 'markup', percent: pct }).sellingPrice)
        .not.toBe(computeCommercialPricing(100, { method: 'target_margin', percent: pct }).sellingPrice);
    }
  });

  it('always states the position BOTH ways, whichever way it was entered', () => {
    for (const p of [
      computeCommercialPricing(2500, { method: 'markup', percent: 22 }),
      computeCommercialPricing(2500, { method: 'target_margin', percent: 22 }),
    ]) {
      expect(p.markupPercent).toBeGreaterThan(0);
      expect(p.marginPercent).toBeGreaterThan(0);
      expect(p.markupPercent).not.toBe(p.marginPercent);
      // The stored record can always be read back unambiguously.
      expect(p.inputPercent).toBe(22);
      expect(['markup', 'target_margin']).toContain(p.pricingMethod);
    }
  });

  it('a 100% margin is impossible — the cap keeps the sell price finite', () => {
    expect(Number.isFinite(computeCommercialPricing(100, { method: 'target_margin', percent: 100 }).sellingPrice)).toBe(true);
  });

  it('a zero cost yields a zero price and no divide-by-zero percentages', () => {
    const p = computeCommercialPricing(0, { method: 'target_margin', percent: 20 });
    expect(p.sellingPrice).toBe(0);
    expect(p.markupPercent).toBe(0);
    expect(p.marginPercent).toBe(0);
  });
});

describe('Layer 2 — discount (percentage or fixed amount)', () => {
  it('a percentage discount reduces the sell and the realised margin', () => {
    const p = computeCommercialPricing(100, { method: 'markup', percent: 20 }, { kind: 'percent', value: 10 });
    expect(p.preDiscountSell).toBe(120);
    expect(p.discount).toBe(12);
    expect(p.sellingPrice).toBe(108);
    expect(p.grossProfit).toBe(8);
    // The reported margin is the REALISED one, not the pre-discount claim.
    expect(p.marginPercent).toBe(7.4074);
  });

  it('a fixed-amount discount is supported — real discounts are often "AED 5,000"', () => {
    const p = computeCommercialPricing(100000, { method: 'target_margin', percent: 20 }, { kind: 'amount', value: 5000 });
    expect(p.preDiscountSell).toBe(125000);
    expect(p.discount).toBe(5000);
    expect(p.sellingPrice).toBe(120000);
  });

  it('a discount can never exceed the price', () => {
    const p = computeCommercialPricing(100, { method: 'markup', percent: 10 }, { kind: 'amount', value: 999999 });
    expect(p.sellingPrice).toBe(0);
    expect(p.discount).toBe(110);
  });
});

describe('the legacy adapter keeps Tendering byte-compatible', () => {
  /**
   * Tendering's submission gate defines "priced" as sellingRate > 0, its CSV export carries the rate
   * and the tender value rolls up from it. The adapter must reproduce the old engine exactly — the
   * golden values in estimation-core.characterization.test.ts are the real gate; this proves the
   * composition is what produces them.
   */
  it('composes the two layers into the historical BuildUpFigures', () => {
    const components = [comp(1000)];
    const legacy = computeBuildUp(components, 10, 20, 5, 7.5);
    const cost = computeCostBuildUp(components, { indirectPercent: 5, overheadPercent: 10, riskPercent: 7.5 });
    const commercial = computeCommercialPricing(cost.estimatedCost, { method: 'markup', percent: 20 });

    expect(legacy.directCost).toBe(cost.directCost);
    expect(legacy.riskAmount).toBe(cost.riskAmount);
    expect(legacy.profitAmount).toBe(commercial.grossProfit);
    expect(legacy.sellingRate).toBe(commercial.sellingPrice);
    // And the seam is exactly where the estimate stops.
    expect(cost.estimatedCost).toBe(legacy.directCost + legacy.indirectAmount + legacy.overheadAmount + legacy.riskAmount);
  });

  it("the adapter's profitPercent is a MARKUP, as this engine has always computed it", () => {
    expect(computeBuildUp([comp(100)], 0, 15, 0, 0).sellingRate).toBe(115);
    expect(computeCommercialPricing(100, { method: 'markup', percent: 15 }).sellingPrice).toBe(115);
  });
});
