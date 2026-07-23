import { describe, it, expect } from 'vitest';
import { emptyEstimationInput, type EstimationLineInput } from '@aura/shared';
import { makePricingSheet, withSheetLines, freezeSheet, reviseSheet, computeSheetTotals } from './pricing-sheet';

const line = (over: Partial<EstimationLineInput> = {}): EstimationLineInput => ({
  ...emptyEstimationInput(),
  description: 'CCTV Camera',
  quantity: 4,
  materialUnitCost: 480,
  labour: { hoursPerUnit: 2, crewSize: 2, hourlyRate: 30 },
  targetMarginPercent: 25,
  ...over,
});

const sheet = () => makePricingSheet({ tenantId: 't1', name: 'Tower B — option A', lines: [line()] });

describe('makePricingSheet', () => {
  it('requires a name and starts as a v1 draft with computed totals', () => {
    expect(() => makePricingSheet({ tenantId: 't1', name: ' ' })).toThrow(/needs a name/);
    const s = sheet();
    expect(s.status).toBe('draft');
    expect(s.version).toBe(1);
    // material 1920 + labour 240 = 2160 cost; 25% margin → 2880 sell.
    expect(s.totals).toEqual({ totalCost: 2160, totalSell: 2880, marginPercent: 25 });
  });
});

describe('withSheetLines', () => {
  it('replaces lines and recomputes totals on a draft', () => {
    const s = withSheetLines(sheet(), [line({ quantity: 8 })]);
    expect(s.totals.totalCost).toBe(4320);
  });

  it('refuses to edit a frozen sheet — the committed build-up is immutable', () => {
    const frozen = freezeSheet(sheet(), 'u-mgr');
    expect(() => withSheetLines(frozen, [])).toThrow(/only a draft/i);
  });
});

describe('freezeSheet', () => {
  it('freezes a draft, stamping who and when', () => {
    const f = freezeSheet(sheet(), 'u-mgr', new Date('2026-07-23T10:00:00Z'));
    expect(f.status).toBe('frozen');
    expect(f.frozenBy).toBe('u-mgr');
    expect(f.frozenAt).toBe('2026-07-23T10:00:00.000Z');
  });

  it('refuses an empty sheet and refuses double-freeze', () => {
    expect(() => freezeSheet(makePricingSheet({ tenantId: 't1', name: 'Empty' }), null)).toThrow(/nothing to freeze/);
    const f = freezeSheet(sheet(), null);
    expect(() => freezeSheet(f, null)).toThrow(/already frozen/);
  });
});

describe('reviseSheet', () => {
  it('spawns a v2 draft from a frozen sheet, carrying the build-up forward', () => {
    const f = freezeSheet(sheet(), 'u-mgr');
    const v2 = reviseSheet(f, 'u-est');
    expect(v2.version).toBe(2);
    expect(v2.status).toBe('draft');
    expect(v2.parentSheetId).toBe(f.id);
    expect(v2.lines[0].materialUnitCost).toBe(480);
    // Deep copy — editing v2's labour must not reach back into the frozen v1.
    v2.lines[0].labour.hoursPerUnit = 99;
    expect(f.lines[0].labour.hoursPerUnit).toBe(2);
  });

  it('only a frozen sheet can be revised — a draft is simply edited', () => {
    expect(() => reviseSheet(sheet(), null)).toThrow(/only a frozen/i);
  });
});

describe('computeSheetTotals', () => {
  it('is empty-safe', () => {
    expect(computeSheetTotals([])).toEqual({ totalCost: 0, totalSell: 0, marginPercent: 0 });
  });
});
