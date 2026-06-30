import { describe, it, expect } from 'vitest';
import { generateSif, validateWpsLine, type WpsEmployeeLine } from './wps';

const line = (over: Partial<WpsEmployeeLine> = {}): WpsEmployeeLine => ({
  molEmployeeId: '78400000000001',
  bankRoutingCode: '602230000000',
  iban: 'AE070331234567890123456',
  startDate: '2026-06-01',
  endDate: '2026-06-30',
  days: 30,
  fixedIncome: 5000,
  variableIncome: 1200,
  name: 'Ali Hassan',
  ...over,
});

const employer = { establishmentId: 'EST-123', bankCode: '602230000000', payMonth: '2026-06' };
const now = new Date('2026-07-02T09:05:00');

describe('WPS SIF', () => {
  it('emits SCR rows + an EDR trailer with totals', () => {
    const r = generateSif(employer, [line(), line({ molEmployeeId: '78400000000002', fixedIncome: 4000, variableIncome: 0 })], now);
    const rows = r.sif.trim().split('\n');
    expect(rows).toHaveLength(3); // 2 SCR + 1 EDR
    expect(rows[0].startsWith('SCR,')).toBe(true);
    expect(rows[2].startsWith('EDR,')).toBe(true);
    expect(r.recordCount).toBe(2);
    expect(r.totalSalary).toBe(10200); // 6200 + 4000
    // EDR carries count, total, currency, file date
    expect(rows[2]).toContain(',2,');
    expect(rows[2]).toContain('10200.00');
    expect(rows[2]).toContain('AED');
    expect(rows[2]).toContain('20260702');
    // SCR formats dates YYYYMMDD + 2dp amounts
    expect(rows[0]).toContain('20260601');
    expect(rows[0]).toContain('5000.00');
  });

  it('validates IBAN, MOL id, routing code', () => {
    expect(() => validateWpsLine(line({ iban: 'AE12' }))).toThrow('IBAN');
    expect(() => validateWpsLine(line({ iban: 'GB070331234567890123456' }))).toThrow('IBAN');
    expect(() => validateWpsLine(line({ molEmployeeId: '' }))).toThrow('MOL id');
    expect(() => validateWpsLine(line({ bankRoutingCode: '' }))).toThrow('routing');
    expect(() => validateWpsLine(line())).not.toThrow();
  });

  it('rejects empty file / bad employer / bad payMonth', () => {
    expect(() => generateSif(employer, [], now)).toThrow('no payroll records');
    expect(() => generateSif({ ...employer, establishmentId: '' }, [line()], now)).toThrow('establishmentId');
    expect(() => generateSif({ ...employer, payMonth: '2026/06' }, [line()], now)).toThrow('payMonth');
  });
});
