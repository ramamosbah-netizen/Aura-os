import { describe, it, expect } from 'vitest';
import { computeDepreciation, monthsBetween } from './depreciation';

describe('monthsBetween', () => {
  it('counts whole months and clamps at 0', () => {
    expect(monthsBetween('2026-01-01', '2026-07-01')).toBe(6);
    expect(monthsBetween('2025-06-01', '2026-06-01')).toBe(12);
    expect(monthsBetween('2026-07-01', '2026-01-01')).toBe(0);
  });
});

describe('straight-line', () => {
  it('depreciates evenly to the salvage floor', () => {
    const s = computeDepreciation({ cost: 12000, salvageValue: 2000, usefulLifeMonths: 10, method: 'straight_line', purchaseDate: '2026-01-01', asOf: '2026-04-01' });
    expect(s.depreciableBase).toBe(10000);
    expect(s.periods[0].depreciation).toBe(1000);
    expect(s.periods).toHaveLength(10);
    // fully depreciated at end → book value == salvage
    expect(s.periods[9].bookValue).toBe(2000);
    expect(s.periods[9].accumulated).toBe(10000);
  });

  it('computes net book value as of a date (3 months in)', () => {
    const s = computeDepreciation({ cost: 12000, salvageValue: 2000, usefulLifeMonths: 10, purchaseDate: '2026-01-01', asOf: '2026-04-01' });
    expect(s.monthsElapsed).toBe(3);
    expect(s.accumulatedToDate).toBe(3000);
    expect(s.netBookValue).toBe(9000);
  });

  it('returns cost as NBV before any time elapses', () => {
    const s = computeDepreciation({ cost: 5000, usefulLifeMonths: 12, purchaseDate: '2026-06-01', asOf: '2026-06-01' });
    expect(s.monthsElapsed).toBe(0);
    expect(s.netBookValue).toBe(5000);
    expect(s.accumulatedToDate).toBe(0);
  });
});

describe('declining-balance', () => {
  it('never depreciates below salvage and ends at the floor', () => {
    const s = computeDepreciation({ cost: 10000, salvageValue: 1000, usefulLifeMonths: 12, method: 'declining_balance', purchaseDate: '2026-01-01', asOf: '2027-01-01' });
    const last = s.periods[s.periods.length - 1];
    expect(last.bookValue).toBeGreaterThanOrEqual(1000 - 0.01);
    expect(s.periods.every((p) => p.bookValue >= 1000 - 0.01)).toBe(true);
  });
});

describe('validation', () => {
  it('rejects non-positive cost', () => {
    expect(() => computeDepreciation({ cost: 0, usefulLifeMonths: 12, purchaseDate: '2026-01-01', asOf: '2026-02-01' })).toThrow('cost must be positive');
  });
  it('rejects salvage >= cost', () => {
    expect(() => computeDepreciation({ cost: 1000, salvageValue: 1000, usefulLifeMonths: 12, purchaseDate: '2026-01-01', asOf: '2026-02-01' })).toThrow('salvage value must be less than cost');
  });
  it('rejects out-of-range life', () => {
    expect(() => computeDepreciation({ cost: 1000, usefulLifeMonths: 0, purchaseDate: '2026-01-01', asOf: '2026-02-01' })).toThrow('useful life must be 1–600 months');
  });
});
