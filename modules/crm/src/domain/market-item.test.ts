import { describe, it, expect } from 'vitest';
import { makeMarketItem, marketItemMarginPercent } from './market-item';

const base = { tenantId: 't1', name: '4MP IP Dome Camera' };

describe('makeMarketItem', () => {
  it('requires a name', () => {
    expect(() => makeMarketItem({ tenantId: 't1', name: '  ' })).toThrow(/needs a name/);
  });

  it('defaults category to OTHER, unit to each, and as-of to today', () => {
    const m = makeMarketItem(base, new Date('2026-07-22T10:00:00Z'));
    expect(m.category).toBe('OTHER');
    expect(m.unit).toBe('each');
    expect(m.asOf).toBe('2026-07-22');
    expect(m.brand).toBeNull();
  });

  it('rejects negative benchmarks', () => {
    expect(() => makeMarketItem({ ...base, benchmarkCost: -1 })).toThrow(/non-negative/);
    expect(() => makeMarketItem({ ...base, installHours: -2 })).toThrow(/non-negative/);
  });

  it('keeps an explicit as-of when it is a valid date', () => {
    expect(makeMarketItem({ ...base, asOf: '2026-06-01' }).asOf).toBe('2026-06-01');
  });

  it('falls back to today when as-of is malformed', () => {
    expect(makeMarketItem({ ...base, asOf: '01/06/2026' }, new Date('2026-07-22T00:00:00Z')).asOf).toBe('2026-07-22');
  });
});

describe('marketItemMarginPercent', () => {
  it('computes margin of sell over cost', () => {
    expect(marketItemMarginPercent({ benchmarkCost: 800, benchmarkSell: 1000 })).toBe(20);
  });
  it('is null when there is no sell to compare', () => {
    expect(marketItemMarginPercent({ benchmarkCost: 800, benchmarkSell: 0 })).toBeNull();
  });
  it('reports a loss-making benchmark as a negative margin rather than hiding it', () => {
    expect(marketItemMarginPercent({ benchmarkCost: 1200, benchmarkSell: 1000 })).toBe(-20);
  });
});
