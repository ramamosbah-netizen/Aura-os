import { describe, expect, it } from 'vitest';
import { Period, Quantity } from './cdm';

describe('CDM Value Objects', () => {
  describe('Period', () => {
    it('calculates duration and checks date containment correctly', () => {
      const p = new Period('2026-06-01', '2026-06-10');
      expect(p.durationDays).toBe(10);
      expect(p.contains(new Date('2026-06-05'))).toBe(true);
      expect(p.contains(new Date('2026-06-11'))).toBe(false);
    });

    it('validates dates order', () => {
      expect(() => new Period('2026-06-10', '2026-06-01')).toThrow('Period start date must be before or equal to end date.');
    });

    it('correctly calculates overlaps', () => {
      const p1 = new Period('2026-06-01', '2026-06-10');
      const p2 = new Period('2026-06-08', '2026-06-15');
      const p3 = new Period('2026-06-12', '2026-06-20');

      expect(p1.overlaps(p2)).toBe(true);
      expect(p1.overlaps(p3)).toBe(false);
    });
  });

  describe('Quantity', () => {
    it('prevents negative quantities', () => {
      expect(() => new Quantity(-5, 'kg')).toThrow();
    });

    it('supports basic addition and subtraction with UoM safety', () => {
      const q1 = new Quantity(10, 'kg');
      const q2 = new Quantity(15, 'kg');
      const q3 = new Quantity(5, 'lbs');

      expect(q1.add(q2).value).toBe(25);
      expect(q2.subtract(q1).value).toBe(5);
      expect(() => q1.add(q3)).toThrow('Unit mismatch');
    });
  });
});
