import { describe, it, expect } from 'vitest';
import { calculateEosb } from './eosb';

describe('EOSB / gratuity (UAE)', () => {
  it('pays nothing under 1 year of service', () => {
    const r = calculateEosb({ basicSalary: 12000, joinedDate: '2024-01-01', lastWorkingDay: '2024-08-01', terminationType: 'termination' });
    expect(r.eligible).toBe(false);
    expect(r.amount).toBe(0);
  });

  it('termination, ~2 years: 21 days/yr, full (no reduction)', () => {
    const r = calculateEosb({ basicSalary: 30000, joinedDate: '2022-01-01', lastWorkingDay: '2024-01-01', terminationType: 'termination' });
    expect(r.eligible).toBe(true);
    expect(r.reductionFactor).toBe(1);
    expect(r.dailyWage).toBe(1000); // 30000 / 30
    expect(r.amount).toBeCloseTo(42000, -2); // ~21 days × ~2 yrs × 1000
  });

  it('resignation, ~2 years: gratuity reduced to 1/3', () => {
    const t = calculateEosb({ basicSalary: 30000, joinedDate: '2022-01-01', lastWorkingDay: '2024-01-01', terminationType: 'termination' });
    const r = calculateEosb({ basicSalary: 30000, joinedDate: '2022-01-01', lastWorkingDay: '2024-01-01', terminationType: 'resignation' });
    expect(r.reductionFactor).toBeCloseTo(1 / 3, 5);
    expect(r.amount).toBeCloseTo(t.grossAmount / 3, 0);
  });

  it('beyond 5 years uses 30 days/yr for the excess', () => {
    const r = calculateEosb({ basicSalary: 30000, joinedDate: '2017-01-01', lastWorkingDay: '2024-01-01', terminationType: 'termination' });
    // ~7 yrs → 21×5 + 30×~2 ≈ 165 days
    expect(r.grossDays).toBeGreaterThan(160);
    expect(r.grossDays).toBeLessThan(170);
    expect(r.reductionFactor).toBe(1);
  });

  it('caps total at 24 months of basic salary', () => {
    const r = calculateEosb({ basicSalary: 10000, joinedDate: '1994-01-01', lastWorkingDay: '2024-01-01', terminationType: 'termination' });
    // 30 yrs of accrual would exceed the cap → clamped to 24 × 10000
    expect(r.amount).toBe(240000);
    expect(r.cappedAmount).toBeLessThan(r.grossAmount);
  });

  it('rejects bad inputs', () => {
    expect(() => calculateEosb({ basicSalary: 0, joinedDate: '2020-01-01', lastWorkingDay: '2024-01-01', terminationType: 'termination' })).toThrow('basicSalary');
    expect(() => calculateEosb({ basicSalary: 5000, joinedDate: '2024-01-01', lastWorkingDay: '2020-01-01', terminationType: 'termination' })).toThrow('after');
  });
});
