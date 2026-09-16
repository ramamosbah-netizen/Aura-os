import { describe, it, expect } from 'vitest';
import {
  governingValue,
  makePurchaseRequestLine,
  mayEditLines,
  nextLineNo,
  readyToSubmit,
  renumber,
  requisitionTotal,
  type PurchaseRequestLine,
} from './purchase-request-line';

const snapshot = {
  materialCode: 'CAM-DOME-4MP',
  materialName: '4MP dome camera',
  specification: 'IP67, 2.8mm',
  manufacturer: 'Hikvision',
  model: 'DS-2CD2143G2-I',
  uom: 'nr',
};

const line = (over: Partial<Parameters<typeof makePurchaseRequestLine>[0]> = {}) =>
  makePurchaseRequestLine({
    tenantId: 't1',
    prId: 'pr-1',
    lineNo: 1,
    materialId: 'mat-1',
    snapshot,
    quantity: 10,
    estimatedUnitCost: 450,
    ...over,
  });

describe('a requisition line names a material, not a description', () => {
  it('refuses a line with no canonical material', () => {
    expect(() => line({ materialId: '' })).toThrow(/must name a canonical material/);
  });

  it('refuses a demand for nothing, or for less than nothing', () => {
    expect(() => line({ quantity: 0 })).toThrow(/greater than zero/);
    expect(() => line({ quantity: -5 })).toThrow(/greater than zero/);
    expect(() => line({ quantity: Number.NaN })).toThrow(/greater than zero/);
  });

  it('refuses a snapshot missing the code, name or unit', () => {
    expect(() => line({ snapshot: { ...snapshot, uom: '' } })).toThrow(/code, name and unit/);
    expect(() => line({ snapshot: { ...snapshot, materialCode: '  ' } })).toThrow(/code, name and unit/);
  });

  it('carries the unit from the material rather than from the requisitioner', () => {
    // The caller passes a snapshot taken from the master; there is no way to type a unit here.
    expect(line({ snapshot: { ...snapshot, uom: 'm' } }).uom).toBe('m');
  });

  it('refuses a negative estimate but accepts none at all on a draft', () => {
    expect(() => line({ estimatedUnitCost: -1 })).toThrow(/cannot be negative/);
    expect(line({ estimatedUnitCost: null }).estimatedUnitCost).toBeNull();
  });

  it('accepts a need-by date already in the past, because late demand is real demand', () => {
    expect(line({ needByDate: '2020-01-01' }).needByDate).toBe('2020-01-01');
  });
});

describe('lines are frozen once the requisition has been sent for a decision', () => {
  it('lets a draft be edited', () => {
    expect(mayEditLines('draft')).toEqual({ allowed: true });
  });

  it('refuses every other state, and says what the lines now are', () => {
    for (const status of ['submitted', 'approved', 'rejected']) {
      const verdict = mayEditLines(status);
      expect(verdict.allowed).toBe(false);
      expect(verdict.reason).toMatch(/only be changed while it is a draft/);
      expect(verdict.reason).toContain(status);
    }
  });
});

describe('an unpriced line does not quietly buy a weaker approval', () => {
  it('adds up a fully priced requisition', () => {
    const lines = [line(), line({ lineNo: 2, quantity: 4, estimatedUnitCost: 125.5 })];
    expect(requisitionTotal(lines)).toMatchObject({
      lineCount: 2, pricedCount: 2, unpricedCount: 0, complete: true,
      pricedSubtotal: 5002, value: 5002,
    });
  });

  it('reports NO value while any line is unpriced — not zero, and not the partial sum', () => {
    const lines = [line(), line({ lineNo: 2, quantity: 4, estimatedUnitCost: null })];
    const total = requisitionTotal(lines);
    expect(total.value).toBeNull();
    expect(total.complete).toBe(false);
    // The partial figure is still available, but as progress, never as the requisition's value.
    expect(total.pricedSubtotal).toBe(4500);
    expect(total.unpricedCount).toBe(1);
  });

  it('has no value at all when there are no lines', () => {
    expect(requisitionTotal([])).toMatchObject({ lineCount: 0, complete: false, value: null });
  });

  it('rounds each line extension before summing, not once at the end', () => {
    // A partial quantity of a 1.00 item: each line extends to 0.333 and rounds to 0.33, so the
    // requisition is 0.66. Summing the raw extensions and rounding once at the end would report
    // 0.67 — a total that no line on the page adds up to.
    const lines = [
      line({ quantity: 0.333, estimatedUnitCost: 1 }),
      line({ lineNo: 2, quantity: 0.333, estimatedUnitCost: 1 }),
    ];
    expect(requisitionTotal(lines).value).toBe(0.66);
  });

  it('rounds the authored unit cost to money, so a stored rate is never a longer number than it looks', () => {
    expect(line({ estimatedUnitCost: 0.335 }).estimatedUnitCost).toBe(0.34);
  });

  it('refuses submission while a line is unpriced, and names the offending lines', () => {
    const lines = [line(), line({ lineNo: 2, estimatedUnitCost: null }), line({ lineNo: 3, estimatedUnitCost: null })];
    const verdict = readyToSubmit(lines);
    expect(verdict.ready).toBe(false);
    expect(verdict.reason).toMatch(/decides who may approve it/);
    expect(verdict.reason).toContain('line 2 (CAM-DOME-4MP)');
    expect(verdict.reason).toContain('line 3 (CAM-DOME-4MP)');
  });

  it('refuses submission of a requisition with no lines at all', () => {
    expect(readyToSubmit([])).toMatchObject({ ready: false });
    expect(readyToSubmit([]).reason).toMatch(/at least one material line/);
  });

  it('allows submission once every line carries an estimate', () => {
    expect(readyToSubmit([line(), line({ lineNo: 2 })])).toEqual({ ready: true });
  });
});

describe('the governing value — derived where there are lines, authored where there are none', () => {
  it('reads a legacy requisition’s authored header figure, because that is what somebody stated', () => {
    expect(governingValue(7500, [])).toEqual({ value: 7500, derived: false });
  });

  it('derives from the lines once they exist, and ignores the header entirely', () => {
    // The header says one thing and the lines say another; the lines win, because they can be checked.
    expect(governingValue(999_999, [line()])).toEqual({ value: 4500, derived: true });
  });

  it('derives NULL rather than falling back to the header when a line is unpriced', () => {
    // The dangerous case: falling back here would let an unpriced line inherit a stale header value.
    expect(governingValue(999_999, [line({ estimatedUnitCost: null })])).toEqual({ value: null, derived: true });
  });
});

describe('line numbering', () => {
  const l = (lineNo: number): PurchaseRequestLine => line({ lineNo });

  it('hands out the next free number', () => {
    expect(nextLineNo([])).toBe(1);
    expect(nextLineNo([l(1), l(4)])).toBe(5);
  });

  it('closes the gap left by a removal, in order', () => {
    expect(renumber([l(1), l(3), l(7)]).map((x) => x.lineNo)).toEqual([1, 2, 3]);
  });

  it('leaves an already-contiguous set untouched, object for object', () => {
    const lines = [l(1), l(2)];
    const out = renumber(lines);
    expect(out[0]).toBe(lines[0]);
    expect(out[1]).toBe(lines[1]);
  });
});
