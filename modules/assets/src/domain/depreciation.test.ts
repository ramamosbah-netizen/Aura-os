import { describe, it, expect } from 'vitest';
import { calculateDepreciation } from './depreciation';

describe('straight-line depreciation', () => {
  it('depreciates cost down to salvage over the useful life', () => {
    const r = calculateDepreciation({ purchaseCost: 100000, purchaseDate: '2026-01-01', usefulLifeYears: 5, salvageValue: 10000 });
    expect(r.annualDepreciation).toBe(18000); // (100000 - 10000) / 5
    expect(r.schedule).toHaveLength(5);
    expect(r.schedule[0]).toMatchObject({ year: 2026, openingValue: 100000, depreciation: 18000, closingValue: 82000 });
    expect(r.schedule[4].closingValue).toBe(10000); // ends exactly at salvage
    expect(r.schedule[4].accumulated).toBe(90000);
  });

  it('handles zero salvage', () => {
    const r = calculateDepreciation({ purchaseCost: 12000, purchaseDate: '2024-06-01', usefulLifeYears: 3 });
    expect(r.annualDepreciation).toBe(4000);
    expect(r.schedule[2].closingValue).toBe(0);
    expect(r.schedule[0].year).toBe(2024);
  });

  it('absorbs rounding in the final year so closing == salvage', () => {
    const r = calculateDepreciation({ purchaseCost: 10000, purchaseDate: '2026-01-01', usefulLifeYears: 3, salvageValue: 1000 });
    // annual = 3000; 3 yrs of 3000 = 9000; closing lands exactly on 1000
    expect(r.schedule[2].closingValue).toBe(1000);
    const totalDep = r.schedule.reduce((s, x) => s + x.depreciation, 0);
    expect(Number(totalDep.toFixed(2))).toBe(9000);
  });

  it('rejects bad inputs', () => {
    expect(() => calculateDepreciation({ purchaseCost: 0, purchaseDate: '2026-01-01', usefulLifeYears: 5 })).toThrow('purchaseCost');
    expect(() => calculateDepreciation({ purchaseCost: 1000, purchaseDate: '2026-01-01', usefulLifeYears: 0 })).toThrow('usefulLifeYears');
    expect(() => calculateDepreciation({ purchaseCost: 1000, purchaseDate: '2026-01-01', usefulLifeYears: 5, salvageValue: 1000 })).toThrow('less than');
  });
});
