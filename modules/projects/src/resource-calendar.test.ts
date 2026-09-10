import { describe, it, expect } from 'vitest';
import { CalendarService } from '@aura/core';
import { resolveWorkingCalendar } from './resource-calendar';

/**
 * The Step 8 calendar bridge, proven against the REAL `@aura/core` CalendarService in its in-memory
 * mode (pool = null). No database: weekends, holidays and Ramadan-style adjustments are all exercised
 * through the same service the app uses, which is why this proof does not wait for Postgres.
 *
 * The week of 2026-03-09: Mon 09, Tue 10, Wed 11, Thu 12, Fri 13, Sat 14, Sun 15, Mon 16, Tue 17.
 */
describe('resolveWorkingCalendar — consuming @aura/core, not re-implementing it', () => {
  const CAL = 'gulf-standard';

  const service = (): CalendarService => {
    const svc = new CalendarService(null); // in-memory mode
    svc.registerInMemoryCalendar(
      { id: CAL, tenantId: 't', companyId: null, name: 'Gulf standard', weekends: [5, 6], standardHoursPerDay: 8 },
      [{ date: '2026-03-16', description: 'Public holiday' }],
      [{ startDate: '2026-03-17', endDate: '2026-03-17', workingHoursPerDay: 6, description: 'Ramadan hours' }],
    );
    return svc;
  };

  it('marks weekends off, holidays off, and adjusted (but non-zero) days on', async () => {
    const cal = await resolveWorkingCalendar(service(), CAL, { from: '2026-03-12', to: '2026-03-17' });
    expect(cal.isWorkingDay('2026-03-12')).toBe(true);  // Thu
    expect(cal.isWorkingDay('2026-03-13')).toBe(false); // Fri weekend
    expect(cal.isWorkingDay('2026-03-14')).toBe(false); // Sat weekend
    expect(cal.isWorkingDay('2026-03-15')).toBe(true);  // Sun (a working day in the Gulf week)
    expect(cal.isWorkingDay('2026-03-16')).toBe(false); // Mon holiday
    expect(cal.isWorkingDay('2026-03-17')).toBe(true);  // Tue, Ramadan hours (6 > 0) still worked
  });

  it('an interval entirely within a weekend resolves to no working days', async () => {
    const cal = await resolveWorkingCalendar(service(), CAL, { from: '2026-03-13', to: '2026-03-14' });
    expect(cal.isWorkingDay('2026-03-13')).toBe(false);
    expect(cal.isWorkingDay('2026-03-14')).toBe(false);
  });
});
