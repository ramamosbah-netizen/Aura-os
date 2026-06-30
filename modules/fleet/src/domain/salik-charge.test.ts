import { describe, it, expect } from 'vitest';
import { makeSalikCharge, allocateSalik, disputeSalik, summariseSalik } from './salik-charge';

const base = { tenantId: 't1', vehicleId: 'v1', gate: 'Al Garhoud', chargeDate: '2026-06-15' };

describe('salik-charge domain', () => {
  it('defaults amount to 4 AED and status recorded', () => {
    const c = makeSalikCharge(base);
    expect(c.amount).toBe(4);
    expect(c.status).toBe('recorded');
    expect(c.gate).toBe('Al Garhoud');
  });

  it('accepts an explicit amount and optional time', () => {
    const c = makeSalikCharge({ ...base, amount: 6, chargeTime: '08:30' });
    expect(c.amount).toBe(6);
    expect(c.chargeTime).toBe('08:30');
  });

  it('validates vehicleId, gate, date and time', () => {
    expect(() => makeSalikCharge({ ...base, vehicleId: '' })).toThrow('vehicleId is required');
    expect(() => makeSalikCharge({ ...base, gate: '' })).toThrow('gate is required');
    expect(() => makeSalikCharge({ ...base, chargeDate: '15-06-2026' })).toThrow('YYYY-MM-DD');
    expect(() => makeSalikCharge({ ...base, chargeTime: '25:00' })).toThrow('HH:MM');
    expect(() => makeSalikCharge({ ...base, amount: 0 })).toThrow('amount must be positive');
  });

  it('allocate moves recorded → allocated and records the owner', () => {
    const c = allocateSalik(makeSalikCharge(base), 'project-A');
    expect(c.status).toBe('allocated');
    expect(c.allocatedTo).toBe('project-A');
    expect(() => allocateSalik(c, 'x')).toThrow('cannot allocate from status allocated');
    expect(() => allocateSalik(makeSalikCharge(base), '')).toThrow('allocatedTo is required');
  });

  it('dispute moves recorded → disputed; cannot dispute an allocated charge', () => {
    expect(disputeSalik(makeSalikCharge(base)).status).toBe('disputed');
    const allocated = allocateSalik(makeSalikCharge(base), 'p');
    expect(() => disputeSalik(allocated)).toThrow('cannot dispute from status allocated');
  });

  it('summariseSalik counts by status and excludes disputed from the total', () => {
    const charges = [
      makeSalikCharge({ ...base, amount: 4 }),
      allocateSalik(makeSalikCharge({ ...base, amount: 6 }), 'p'),
      disputeSalik(makeSalikCharge({ ...base, amount: 4 })),
    ];
    const s = summariseSalik(charges);
    expect(s.count).toBe(3);
    expect(s.recorded).toBe(1);
    expect(s.allocated).toBe(1);
    expect(s.disputed).toBe(1);
    expect(s.totalAmount).toBe(10); // 4 + 6, disputed 4 excluded
  });
});
