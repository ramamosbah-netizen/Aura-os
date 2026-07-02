import { describe, expect, it } from 'vitest';
import {
  activateAgreement,
  isWithinValidity,
  makeFrameworkAgreement,
  recordCallOff,
  remainingValue,
  terminateAgreement,
  type NewFrameworkAgreement,
} from './framework-agreement';

const base: NewFrameworkAgreement = {
  tenantId: 't-1',
  title: 'Ready-mix concrete 2026',
  supplierId: 'sup-1',
  supplierName: 'Gulf Readymix',
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  ceilingValue: 500000,
  items: [{ description: 'C30 concrete', unit: 'm3', rate: 285 }],
};

describe('framework agreement', () => {
  it('creates a draft agreement with a rate card', () => {
    const fa = makeFrameworkAgreement(base);
    expect(fa.status).toBe('draft');
    expect(fa.calledOffValue).toBe(0);
    expect(remainingValue(fa)).toBe(500000);
    expect(fa.items[0]).toEqual({ description: 'C30 concrete', unit: 'm3', rate: 285 });
  });

  it('validates dates, ceiling and rate card', () => {
    expect(() => makeFrameworkAgreement({ ...base, validTo: '2025-01-01' })).toThrow(/validTo/);
    expect(() => makeFrameworkAgreement({ ...base, validFrom: 'nope' })).toThrow(/YYYY-MM-DD/);
    expect(() => makeFrameworkAgreement({ ...base, ceilingValue: 0 })).toThrow(/positive/);
    expect(() =>
      makeFrameworkAgreement({ ...base, items: [{ description: 'x', unit: 'm', rate: -1 }] }),
    ).toThrow(/negative/);
  });

  it('lifecycle: draft → active → terminated', () => {
    const fa = makeFrameworkAgreement(base);
    const active = activateAgreement(fa);
    expect(active.status).toBe('active');
    expect(() => activateAgreement(active)).toThrow(/draft/);
    const terminated = terminateAgreement(active);
    expect(terminated.status).toBe('terminated');
    expect(() => terminateAgreement(terminated)).toThrow(/already/);
  });

  it('call-offs draw down the ceiling and stop at the remaining value', () => {
    let fa = activateAgreement(makeFrameworkAgreement(base));
    fa = recordCallOff(fa, 200000, '2026-06-15');
    expect(fa.calledOffValue).toBe(200000);
    expect(remainingValue(fa)).toBe(300000);
    fa = recordCallOff(fa, 300000, '2026-06-16');
    expect(remainingValue(fa)).toBe(0);
    expect(() => recordCallOff(fa, 1, '2026-06-17')).toThrow(/exceeds remaining/);
  });

  it('rejects call-offs on draft/terminated agreements and outside validity', () => {
    const draft = makeFrameworkAgreement(base);
    expect(() => recordCallOff(draft, 100, '2026-06-15')).toThrow(/not active/);
    const active = activateAgreement(draft);
    expect(() => recordCallOff(active, 100, '2027-01-01')).toThrow(/validity/);
    expect(() => recordCallOff(active, -5, '2026-06-15')).toThrow(/positive/);
    expect(isWithinValidity(active, '2026-12-31')).toBe(true);
    expect(isWithinValidity(active, '2027-01-01')).toBe(false);
  });
});
