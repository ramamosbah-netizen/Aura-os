import { describe, it, expect } from 'vitest';
import { makeAttendanceRecord, computeWorkedHours, checkOutAttendance, summariseAttendance } from './attendance';

describe('attendance domain', () => {
  it('computeWorkedHours returns hours between times, 0 if either missing', () => {
    expect(computeWorkedHours('09:00', '17:30')).toBe(8.5);
    expect(computeWorkedHours('08:00', '12:15')).toBe(4.25);
    expect(computeWorkedHours('09:00', null)).toBe(0);
    expect(computeWorkedHours(null, '17:00')).toBe(0);
  });

  it('computeWorkedHours rejects check-out at/before check-in', () => {
    expect(() => computeWorkedHours('17:00', '09:00')).toThrow('after check-in');
    expect(() => computeWorkedHours('09:00', '09:00')).toThrow('after check-in');
  });

  it('makeAttendanceRecord defaults status present and derives worked hours', () => {
    const r = makeAttendanceRecord({ tenantId: 't1', employeeId: 'e1', employeeName: 'Ali', date: '2026-06-30', checkIn: '09:00', checkOut: '18:00' });
    expect(r.status).toBe('present');
    expect(r.workedHours).toBe(9);
    expect(r.employeeName).toBe('Ali');
  });

  it('validates date, time format, and status', () => {
    expect(() => makeAttendanceRecord({ tenantId: 't1', employeeId: 'e1', date: '30-06-2026' })).toThrow('YYYY-MM-DD');
    expect(() => makeAttendanceRecord({ tenantId: 't1', employeeId: 'e1', date: '2026-06-30', checkIn: '9am' })).toThrow('HH:MM');
    // @ts-expect-error invalid status at runtime
    expect(() => makeAttendanceRecord({ tenantId: 't1', employeeId: 'e1', date: '2026-06-30', status: 'vacation' })).toThrow('invalid status');
    expect(() => makeAttendanceRecord({ tenantId: 't1', employeeId: '', date: '2026-06-30' })).toThrow('employeeId is required');
  });

  it('absent/leave records carry no times and zero hours', () => {
    const r = makeAttendanceRecord({ tenantId: 't1', employeeId: 'e1', date: '2026-06-30', status: 'absent' });
    expect(r.workedHours).toBe(0);
    expect(r.checkIn).toBeNull();
  });

  it('checkOutAttendance recomputes hours and requires a check-in', () => {
    const r = makeAttendanceRecord({ tenantId: 't1', employeeId: 'e1', date: '2026-06-30', checkIn: '09:00' });
    expect(r.workedHours).toBe(0);
    const out = checkOutAttendance(r, '13:30');
    expect(out.checkOut).toBe('13:30');
    expect(out.workedHours).toBe(4.5);
    const noIn = makeAttendanceRecord({ tenantId: 't1', employeeId: 'e1', date: '2026-06-30', status: 'absent' });
    expect(() => checkOutAttendance(noIn, '17:00')).toThrow('without a check-in');
  });

  it('summariseAttendance counts by status and totals hours', () => {
    const recs = [
      makeAttendanceRecord({ tenantId: 't1', employeeId: 'e1', date: '2026-06-01', checkIn: '09:00', checkOut: '17:00' }), // present 8h
      makeAttendanceRecord({ tenantId: 't1', employeeId: 'e1', date: '2026-06-02', status: 'absent' }),
      makeAttendanceRecord({ tenantId: 't1', employeeId: 'e1', date: '2026-06-03', status: 'leave' }),
      makeAttendanceRecord({ tenantId: 't1', employeeId: 'e1', date: '2026-06-04', status: 'late', checkIn: '10:00', checkOut: '17:00' }), // 7h
    ];
    const s = summariseAttendance(recs);
    expect(s.count).toBe(4);
    expect(s.present).toBe(1);
    expect(s.absent).toBe(1);
    expect(s.leave).toBe(1);
    expect(s.late).toBe(1);
    expect(s.totalHours).toBe(15);
  });
});
