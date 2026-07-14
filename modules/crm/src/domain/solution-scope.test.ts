import { describe, it, expect } from 'vitest';
import {
  makeRequirement, makeSolutionScope, makeScopeLine, computeScopeTotal,
  approveScope, scopeLinesToQuotationLines,
} from './solution-scope';

const base = { tenantId: 't1', opportunityId: 'o1' };

describe('makeRequirement', () => {
  it('captures a prioritised requirement, defaulting priority to should', () => {
    const r = makeRequirement({ ...base, title: '24/7 CCTV coverage' });
    expect(r.title).toBe('24/7 CCTV coverage');
    expect(r.priority).toBe('should');
    expect(r.status).toBe('open');
  });
  it('requires a title', () => {
    expect(() => makeRequirement({ ...base, title: '  ' })).toThrow('title is required');
  });
});

describe('scope lines + totals', () => {
  it('computes a line total and rolls up the scope total', () => {
    const scope = makeSolutionScope({
      ...base, title: 'Tower ELV', lines: [
        { discipline: 'CCTV', description: '4MP dome camera', unit: 'no', quantity: 40, unitPrice: 600 }, // 24000
        { discipline: 'ACS', description: 'Door controller', unit: 'no', quantity: 10, unitPrice: 1500 }, // 15000
      ],
    });
    expect(scope.lines[0].lineTotal).toBe(24000);
    expect(scope.total).toBe(39000);
    expect(scope.status).toBe('draft');
  });
  it('rejects a non-positive quantity', () => {
    expect(() => makeScopeLine({ description: 'x', quantity: 0 })).toThrow('quantity must be positive');
  });
  it('defaults unit to lot and unitPrice to 0', () => {
    const l = makeScopeLine({ description: 'Commissioning', quantity: 1 });
    expect(l.unit).toBe('lot');
    expect(l.unitPrice).toBe(0);
    expect(l.lineTotal).toBe(0);
  });
});

describe('approveScope', () => {
  const withLines = () => makeSolutionScope({ ...base, title: 'S', lines: [{ description: 'Camera', quantity: 1, unitPrice: 100 }] });

  it('approves a scope that has lines', () => {
    const a = approveScope(withLines(), 'u-eng');
    expect(a.status).toBe('approved');
    expect(a.approvedBy).toBe('u-eng');
    expect(a.approvedAt).toBeTruthy();
  });
  it('cannot approve a scope with no lines (nothing to quote)', () => {
    expect(() => approveScope(makeSolutionScope({ ...base, title: 'Empty' }), null)).toThrow('no lines');
  });
  it('cannot approve twice', () => {
    expect(() => approveScope(approveScope(withLines(), null), null)).toThrow('already approved');
  });
});

describe('scopeLinesToQuotationLines', () => {
  it('maps scope lines to quotation lines, prefixing the discipline', () => {
    const scope = makeSolutionScope({ ...base, title: 'S', lines: [{ discipline: 'CCTV', description: 'Camera', quantity: 2, unitPrice: 500 }] });
    const [line] = scopeLinesToQuotationLines(scope);
    expect(line).toEqual({ description: 'CCTV: Camera', quantity: 2, unitPrice: 500 });
  });
});
