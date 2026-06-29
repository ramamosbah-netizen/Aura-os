import { describe, it, expect } from 'vitest';
import { makeTimesheetEntry, submitTimesheet, approveTimesheet, rejectTimesheet, summarizeWeek } from './timesheet';

const T = 'tenant-1';
const E = 'emp-1';

describe('Timesheet', () => {
  it('creates a valid entry', () => {
    const e = makeTimesheetEntry({ tenantId: T, employeeId: E, date: '2026-06-29', hours: 8, overtime: 2, description: 'cable pulling' });
    expect(e.hours).toBe(8);
    expect(e.overtime).toBe(2);
    expect(e.status).toBe('draft');
  });

  it('rejects hours > 24', () => {
    expect(() => makeTimesheetEntry({ tenantId: T, employeeId: E, date: '2026-06-29', hours: 25 })).toThrow('between 0 and 24');
  });

  it('rejects total > 24', () => {
    expect(() => makeTimesheetEntry({ tenantId: T, employeeId: E, date: '2026-06-29', hours: 20, overtime: 6 })).toThrow('exceed 24');
  });

  it('rejects bad date format', () => {
    expect(() => makeTimesheetEntry({ tenantId: T, employeeId: E, date: '29/06/2026', hours: 8 })).toThrow('YYYY-MM-DD');
  });

  it('follows draft → submitted → approved flow', () => {
    const e = makeTimesheetEntry({ tenantId: T, employeeId: E, date: '2026-06-29', hours: 8 });
    const s = submitTimesheet(e);
    expect(s.status).toBe('submitted');
    const a = approveTimesheet(s, 'mgr-1');
    expect(a.status).toBe('approved');
    expect(a.approvedBy).toBe('mgr-1');
  });

  it('follows draft → submitted → rejected flow', () => {
    const e = makeTimesheetEntry({ tenantId: T, employeeId: E, date: '2026-06-29', hours: 8 });
    const s = submitTimesheet(e);
    const r = rejectTimesheet(s);
    expect(r.status).toBe('rejected');
  });

  it('cannot approve a draft', () => {
    const e = makeTimesheetEntry({ tenantId: T, employeeId: E, date: '2026-06-29', hours: 8 });
    expect(() => approveTimesheet(e, 'mgr-1')).toThrow('cannot approve');
  });

  it('summarizes a week', () => {
    const entries = [
      makeTimesheetEntry({ tenantId: T, employeeId: E, date: '2026-06-29', hours: 8, overtime: 1 }),
      makeTimesheetEntry({ tenantId: T, employeeId: E, date: '2026-06-30', hours: 9, overtime: 2 }),
    ];
    const s = summarizeWeek(entries)!;
    expect(s.totalHours).toBe(17);
    expect(s.totalOvertime).toBe(3);
  });
});
