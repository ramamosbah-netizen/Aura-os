import { describe, it, expect } from 'vitest';
import { makeTrafficFine, assignFine, disputeFine, payFine } from './traffic-fine';

const base = { tenantId: 't1', vehicleId: 'v1', fineNumber: 'DXB-12345', violation: 'Speeding 30km/h over', amount: 600, fineDate: '2026-06-20' };

describe('TrafficFine', () => {
  it('creates a pending fine', () => {
    const f = makeTrafficFine({ ...base, blackPoints: 4, location: 'Sheikh Zayed Rd' });
    expect(f.status).toBe('pending');
    expect(f.amount).toBe(600);
    expect(f.blackPoints).toBe(4);
    expect(f.driverEmployeeId).toBeNull();
  });

  it('rejects non-positive amount', () => {
    expect(() => makeTrafficFine({ ...base, amount: 0 })).toThrow('amount must be positive');
  });

  it('rejects black points out of range', () => {
    expect(() => makeTrafficFine({ ...base, blackPoints: 25 })).toThrow('between 0 and 24');
  });

  it('rejects bad date format', () => {
    expect(() => makeTrafficFine({ ...base, fineDate: '20-06-2026' })).toThrow('YYYY-MM-DD');
  });

  it('assigns driver liability (pending → assigned)', () => {
    const f = assignFine(makeTrafficFine(base), 'emp-7');
    expect(f.status).toBe('assigned');
    expect(f.driverEmployeeId).toBe('emp-7');
  });

  it('pays from assigned', () => {
    const f = payFine(assignFine(makeTrafficFine(base), 'emp-7'), '2026-06-25');
    expect(f.status).toBe('paid');
    expect(f.paidDate).toBe('2026-06-25');
  });

  it('pays directly from pending', () => {
    const f = payFine(makeTrafficFine(base));
    expect(f.status).toBe('paid');
    expect(f.paidDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('disputes from pending', () => {
    const f = disputeFine(makeTrafficFine(base));
    expect(f.status).toBe('disputed');
  });

  it('cannot pay a disputed fine', () => {
    const f = disputeFine(makeTrafficFine(base));
    expect(() => payFine(f)).toThrow('disputed');
  });

  it('cannot assign an already-paid fine', () => {
    const f = payFine(makeTrafficFine(base));
    expect(() => assignFine(f, 'emp-7')).toThrow('cannot assign');
  });
});
