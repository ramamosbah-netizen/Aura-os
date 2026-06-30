import { describe, expect, it } from 'vitest';
import {
  makeBackCharge,
  applyRecovery,
  summariseBackCharges,
  type BackCharge,
} from './back-charge';

const base = {
  tenantId: 't1',
  subcontractId: 'sc1',
  reference: 'BC-001',
  description: 'Crane hire on subcontractor behalf',
  grossAmount: 10000,
};

describe('Subcontract Back-Charges', () => {
  describe('makeBackCharge', () => {
    it('computes markup and recoverable, starts raised with full outstanding', () => {
      const bc = makeBackCharge({ ...base, category: 'plant', markupPercent: 10 });
      expect(bc.grossAmount).toBe(10000);
      expect(bc.markupAmount).toBe(1000);
      expect(bc.recoverableAmount).toBe(11000);
      expect(bc.recoveredAmount).toBe(0);
      expect(bc.outstandingAmount).toBe(11000);
      expect(bc.status).toBe('raised');
      expect(bc.category).toBe('plant');
      expect(bc.subcontractorName).toBeNull();
    });

    it('defaults markup to 0 and category to other', () => {
      const bc = makeBackCharge(base);
      expect(bc.markupAmount).toBe(0);
      expect(bc.recoverableAmount).toBe(10000);
      expect(bc.category).toBe('other');
    });

    it('snapshots and trims the subcontractor name', () => {
      const bc = makeBackCharge({ ...base, subcontractorName: '  Al Futtaim Steel  ' });
      expect(bc.subcontractorName).toBe('Al Futtaim Steel');
    });

    it('rejects non-positive gross amounts', () => {
      expect(() => makeBackCharge({ ...base, grossAmount: 0 })).toThrow(/positive/);
      expect(() => makeBackCharge({ ...base, grossAmount: -5 })).toThrow(/positive/);
    });

    it('rejects negative markup', () => {
      expect(() => makeBackCharge({ ...base, markupPercent: -1 })).toThrow(/negative/);
    });

    it('requires a description and a reference', () => {
      expect(() => makeBackCharge({ ...base, description: '   ' })).toThrow(/description/);
      expect(() => makeBackCharge({ ...base, reference: '' })).toThrow(/reference/);
    });
  });

  describe('applyRecovery', () => {
    const agreed = (): BackCharge => ({ ...makeBackCharge({ ...base, markupPercent: 10 }), status: 'agreed' });

    it('records a partial recovery and keeps status agreed', () => {
      const bc = applyRecovery(agreed(), 4000);
      expect(bc.recoveredAmount).toBe(4000);
      expect(bc.outstandingAmount).toBe(7000);
      expect(bc.status).toBe('agreed');
    });

    it('flips to recovered when the outstanding balance reaches zero', () => {
      const bc = applyRecovery(agreed(), 11000);
      expect(bc.recoveredAmount).toBe(11000);
      expect(bc.outstandingAmount).toBe(0);
      expect(bc.status).toBe('recovered');
    });

    it('accumulates across multiple recoveries', () => {
      let bc = applyRecovery(agreed(), 5000);
      bc = applyRecovery(bc, 6000);
      expect(bc.recoveredAmount).toBe(11000);
      expect(bc.status).toBe('recovered');
    });

    it('refuses to recover more than the outstanding balance', () => {
      expect(() => applyRecovery(agreed(), 11000.01)).toThrow(/exceeds outstanding/);
    });

    it('refuses recovery on a back-charge that is not agreed', () => {
      const raised = makeBackCharge(base);
      expect(() => applyRecovery(raised, 100)).toThrow(/agreed/);
    });

    it('rejects non-positive recovery amounts', () => {
      expect(() => applyRecovery(agreed(), 0)).toThrow(/positive/);
    });
  });

  describe('summariseBackCharges', () => {
    it('aggregates totals and counts by status, excluding written-off from outstanding', () => {
      const a = { ...makeBackCharge({ ...base, reference: 'BC-1', markupPercent: 10 }), status: 'agreed' as const, recoveredAmount: 4000, outstandingAmount: 7000 };
      const b = { ...makeBackCharge({ ...base, reference: 'BC-2', grossAmount: 5000 }), status: 'disputed' as const };
      const c = { ...makeBackCharge({ ...base, reference: 'BC-3', grossAmount: 2000 }), status: 'written_off' as const };
      const sum = summariseBackCharges([a, b, c]);
      expect(sum.count).toBe(3);
      expect(sum.totalGross).toBe(17000);
      expect(sum.totalRecovered).toBe(4000);
      // outstanding = a.outstanding(7000) + b.outstanding(5000); c written-off excluded
      expect(sum.totalOutstanding).toBe(12000);
      expect(sum.byStatus.agreed).toBe(1);
      expect(sum.byStatus.disputed).toBe(1);
      expect(sum.byStatus.written_off).toBe(1);
    });

    it('returns zeroed totals for an empty list', () => {
      const sum = summariseBackCharges([]);
      expect(sum.count).toBe(0);
      expect(sum.totalOutstanding).toBe(0);
      expect(sum.byStatus.raised).toBe(0);
    });
  });
});
