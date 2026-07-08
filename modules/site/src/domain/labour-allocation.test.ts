import { describe, expect, it } from 'vitest';
import { makeLabourAllocation, summariseByTrade, type LabourAllocation } from './labour-allocation';

const alloc = (trade: string, headcount: number, hours: number): LabourAllocation =>
  makeLabourAllocation({ tenantId: 't1', projectId: 'p1', date: '2026-07-07', trade, headcount, hours });

describe('LabourAllocation', () => {
  describe('makeLabourAllocation', () => {
    it('rolls up man-hours as headcount × hours (2dp)', () => {
      expect(alloc('Steelfixer', 6, 8).manHours).toBe(48);
      expect(alloc('Painter', 3, 7.5).manHours).toBe(22.5);
    });

    it('coerces missing/invalid numbers to 0, trims the trade, slices the date', () => {
      const a = makeLabourAllocation({ tenantId: 't1', projectId: 'p1', date: '2026-07-07T09:00:00Z', trade: '  Mason  ', headcount: NaN as unknown as number, hours: 8 });
      expect(a.headcount).toBe(0);
      expect(a.manHours).toBe(0);
      expect(a.trade).toBe('Mason');
      expect(a.date).toBe('2026-07-07');
    });
  });

  describe('summariseByTrade', () => {
    it('sums headcount and man-hours per trade', () => {
      const out = summariseByTrade([alloc('Steelfixer', 6, 8), alloc('Steelfixer', 4, 8), alloc('Mason', 3, 8)]);
      const steel = out.find((t) => t.trade === 'Steelfixer')!;
      expect(steel.headcount).toBe(10);
      expect(steel.manHours).toBe(80);
      const mason = out.find((t) => t.trade === 'Mason')!;
      expect(mason.manHours).toBe(24);
    });

    it('orders trades by man-hours descending', () => {
      const out = summariseByTrade([alloc('Painter', 2, 8), alloc('Steelfixer', 10, 8), alloc('Mason', 5, 8)]);
      expect(out.map((t) => t.trade)).toEqual(['Steelfixer', 'Mason', 'Painter']);
    });

    it('returns an empty roll-up for no allocations', () => {
      expect(summariseByTrade([])).toEqual([]);
    });

    it('keeps the man-hour sum rounded to 2dp', () => {
      const out = summariseByTrade([alloc('Carpenter', 1, 7.5), alloc('Carpenter', 1, 7.55)]);
      expect(out[0].manHours).toBe(15.05);
    });
  });
});
