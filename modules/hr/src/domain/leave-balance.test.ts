import { describe, it, expect } from 'vitest';
import { leaveDays, computeLeaveBalance } from './leave-balance';

describe('leave-balance', () => {
  it('leaveDays is inclusive', () => {
    expect(leaveDays('2026-06-01', '2026-06-05')).toBe(5);
    expect(leaveDays('2026-06-01', '2026-06-01')).toBe(1);
  });

  it('accrues pro-rata and subtracts approved leave', () => {
    const b = computeLeaveBalance({
      annualDays: 30, joinedDate: '2026-01-01', asOf: '2026-07-01',
      leaves: [
        { startDate: '2026-03-01', endDate: '2026-03-05', status: 'approved' }, // 5
        { startDate: '2026-04-01', endDate: '2026-04-02', status: 'pending' },   // ignored
      ],
    });
    expect(b.monthsWorked).toBe(6);
    expect(b.accrued).toBe(15);   // 30 × 6/12
    expect(b.taken).toBe(5);
    expect(b.remaining).toBe(10);
  });

  it('validates inputs', () => {
    expect(() => computeLeaveBalance({ annualDays: -1, joinedDate: '2026-01-01', asOf: '2026-07-01', leaves: [] })).toThrow('annualDays');
    expect(() => computeLeaveBalance({ annualDays: 30, joinedDate: 'x', asOf: '2026-07-01', leaves: [] })).toThrow('joinedDate');
  });
});
