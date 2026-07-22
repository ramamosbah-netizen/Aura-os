import { describe, it, expect } from 'vitest';
import { analysePricing, type LineRefs, type SheetLineForAdvice } from './pricing-advice';

const line = (over: Partial<SheetLineForAdvice>): SheetLineForAdvice =>
  ({ description: 'Item', quantity: 1, unitCost: 100, unitPrice: 150, ...over });

describe('analysePricing', () => {
  it('flags a line that sells below cost as a loss', () => {
    const a = analysePricing([line({ unitCost: 200, unitPrice: 150 })], [{}]);
    expect(a.findings[0].band).toBe('loss');
    expect(a.lossLines).toBe(1);
    expect(a.findings[0].notes[0]).toMatch(/below cost/i);
  });

  it('flags a thin margin', () => {
    const a = analysePricing([line({ unitCost: 95, unitPrice: 100 })], [{}]);
    expect(a.findings[0].band).toBe('thin');
    expect(a.thinLines).toBe(1);
  });

  it('computes blended margin across the sheet by value', () => {
    const a = analysePricing(
      [line({ quantity: 2, unitCost: 100, unitPrice: 200 }), line({ quantity: 1, unitCost: 100, unitPrice: 100 })],
      [{}, {}],
    );
    // cost 300, sell 500 → 40%.
    expect(a.blendedMargin).toBe(40);
  });

  it('warns when a line prices well above the catalogue benchmark', () => {
    const refs: LineRefs[] = [{ benchmark: { benchmarkCost: 500, benchmarkSell: 800, source: 'offer' } }];
    const a = analysePricing([line({ unitCost: 500, unitPrice: 1000 })], refs);
    expect(a.aboveMarketLines).toBe(1);
    expect(a.findings[0].notes.some((n) => /above the catalogue benchmark/i.test(n))).toBe(true);
  });

  it('notes leaving money on the table when below the benchmark', () => {
    const refs: LineRefs[] = [{ benchmark: { benchmarkCost: 500, benchmarkSell: 800, source: null } }];
    const a = analysePricing([line({ unitCost: 500, unitPrice: 650 })], refs);
    expect(a.belowMarketLines).toBe(1);
    expect(a.findings[0].notes.some((n) => /leaving money/i.test(n))).toBe(true);
  });

  it('compares against historic spread', () => {
    const refs: LineRefs[] = [{ historic: { lastPrice: 700, minPrice: 600, maxPrice: 800, count: 5 } }];
    const above = analysePricing([line({ unitCost: 400, unitPrice: 900 })], refs);
    expect(above.findings[0].notes.some((n) => /Higher than any past quote/i.test(n))).toBe(true);
  });

  it('produces a headline even with no references', () => {
    const a = analysePricing([line({})], [{}]);
    expect(a.headline).toMatch(/Blended margin/);
  });
});
