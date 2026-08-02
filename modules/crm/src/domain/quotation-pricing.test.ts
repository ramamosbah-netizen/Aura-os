import { describe, it, expect } from 'vitest';
import { deriveSellUnitPrice, computeQuotationPricing, computeEstimationPricing } from './quotation-pricing';
import { buildQuotationLine } from './quotation';
import { emptyEstimationInput, estimateLine, type EstimationLineInput } from '@aura/shared';

describe('deriveSellUnitPrice — the authoring direction (cost + target margin → sell)', () => {
  it('derives the price that yields the target margin on the sell', () => {
    // margin is on SELL: sell = cost / (1 - m)
    expect(deriveSellUnitPrice(100, 25)).toBeCloseTo(133.33, 2);
    expect(deriveSellUnitPrice(100, 50)).toBe(200);
    expect(deriveSellUnitPrice(70, 30)).toBe(100);
  });

  it('a zero (or negative) margin quotes at cost', () => {
    expect(deriveSellUnitPrice(100, 0)).toBe(100);
    expect(deriveSellUnitPrice(100, -10)).toBe(100);
  });

  it('clamps the margin below 100% so the price never blows up', () => {
    // 99.9% is the ceiling — a finite, if large, multiple of cost.
    expect(deriveSellUnitPrice(1, 100)).toBe(deriveSellUnitPrice(1, 99.9));
    expect(Number.isFinite(deriveSellUnitPrice(100, 100))).toBe(true);
  });

  it('round-trips: applying the derived price back yields the target margin', () => {
    const cost = 137;
    const target = 22;
    const sell = deriveSellUnitPrice(cost, target);
    const margin = ((sell - cost) / sell) * 100;
    expect(margin).toBeCloseTo(target, 1);
  });
});

describe('computeQuotationPricing — all-in unit cost drives the authored sell', () => {
  it('rolls a build-up up to the unit cost the sheet prices from', () => {
    const line = buildQuotationLine({ description: 'Camera', quantity: 10, unitPrice: 0, vatRate: 5 });
    const sheet = computeQuotationPricing([line], { lines: [{ ...emptyBuildup(), supplyUnitPrice: 100 }] });
    // 10 × 100 supply = 1000 direct cost → 100 all-in per unit.
    expect(sheet.lines[0].costTotal).toBe(1000);
    expect(sheet.lines[0].unitCostTotal).toBe(100);
    // At a 25% target, that unit cost authors a 133.33 sell.
    expect(deriveSellUnitPrice(sheet.lines[0].unitCostTotal, 25)).toBeCloseTo(133.33, 2);
  });
});

describe('computeEstimationPricing — the read view reflects the CANONICAL estimateLine engine', () => {
  it('projects the estimation build-up into the sheet shape with real cost (not the empty legacy field)', () => {
    const est: EstimationLineInput = {
      ...emptyEstimationInput(),
      description: 'Camera install',
      quantity: 10,
      materialUnitCost: 100,
      labour: { hoursPerUnit: 2, crewSize: 2, hourlyRate: 50 },
      overheadPercent: 10,
      targetMarginPercent: 25,
    };
    const r = estimateLine(est);
    // The quote line is generated from the engine's derived sell price.
    const line = buildQuotationLine({ description: 'Camera install', quantity: 10, unitPrice: r.unitSellPrice, vatRate: 5 });

    const sheet = computeEstimationPricing([line], [est]);
    // Real cost surfaces — the whole point of the fix.
    expect(sheet.lines[0].costTotal).toBe(r.totalCost);
    expect(sheet.lines[0].unitCostTotal).toBe(r.unitCost);
    expect(sheet.totalCost).toBe(r.totalCost);
    // Labour lands in the technician row; loadings fold into the single indirect bucket.
    expect(sheet.lines[0].labourTotal).toBe(r.labourCost);
    expect(sheet.lines[0].indirectCost).toBe(r.overheadCost + r.riskCost + r.warrantyCost + r.contingencyCost);
    // Margin is honest against the quoted price ≈ the target margin.
    expect(sheet.lines[0].marginPercent).toBeCloseTo(25, 0);
  });

  it('surfaces the quoted line with cost unknown when no build-up is aligned', () => {
    const line = buildQuotationLine({ description: 'Orphan', quantity: 1, unitPrice: 500, vatRate: 5 });
    const sheet = computeEstimationPricing([line], []);
    expect(sheet.lines[0].costTotal).toBe(0);
    expect(sheet.lines[0].sellTotal).toBe(500);
  });
});

function emptyBuildup() {
  return {
    supplyUnitPrice: 0, wastagePercent: 0, accessories: 0,
    technician: { count: 0, hours: 0, rate: 0 },
    engineer: { count: 0, hours: 0, rate: 0 },
    projectManager: { count: 0, hours: 0, rate: 0 },
    transport: 0, equipmentRent: 0, subcontract: 0, otherDirect: 0, indirectPercent: 0,
  };
}
