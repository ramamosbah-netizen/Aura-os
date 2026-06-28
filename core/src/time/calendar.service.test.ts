import { describe, expect, it, vi } from 'vitest';
import { CalendarService } from './calendar.service';
import type { Pool } from 'pg';

describe('CalendarService', () => {
  it('correctly calculates working days and hours in-memory', async () => {
    const service = new CalendarService(null);

    // Register standard UAE site calendar
    // Weekends: Friday (5) and Saturday (6) or standard Sat/Sun (6, 0)
    service.registerInMemoryCalendar(
      {
        id: 'cal-uae',
        tenantId: 't1',
        companyId: 'c1',
        name: 'UAE Standard Calendar',
        weekends: [0, 6], // Saturday, Sunday
        standardHoursPerDay: 8,
      },
      [
        { date: '2026-01-01', description: 'New Year' },
        { date: '2026-12-02', description: 'National Day' },
      ],
      [
        {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          workingHoursPerDay: 6,
          description: 'Ramadan hours',
        },
      ]
    );

    // Thursday (non-weekend, non-holiday)
    const hoursStandard = await service.getWorkingHoursForDay('cal-uae', new Date('2026-01-15'));
    expect(hoursStandard).toBe(8);

    // Sunday (weekend)
    const hoursWeekend = await service.getWorkingHoursForDay('cal-uae', new Date('2026-01-18'));
    expect(hoursWeekend).toBe(0);

    // Holiday (2026-01-01 is Thursday)
    const hoursHoliday = await service.getWorkingHoursForDay('cal-uae', new Date('2026-01-01'));
    expect(hoursHoliday).toBe(0);

    // Ramadan adjustment (2026-03-10 is Tuesday)
    const hoursRamadan = await service.getWorkingHoursForDay('cal-uae', new Date('2026-03-10'));
    expect(hoursRamadan).toBe(6);
  });

  it('correctly adds working days skipping weekends and holidays', async () => {
    const service = new CalendarService(null);
    service.registerInMemoryCalendar(
      {
        id: 'cal-uae',
        tenantId: 't1',
        companyId: 'c1',
        name: 'UAE Standard Calendar',
        weekends: [0, 6],
        standardHoursPerDay: 8,
      },
      [
        { date: '2026-01-01', description: 'New Year' }, // Thursday
      ]
    );

    // Start on Wed Dec 31, 2025. Add 2 working days.
    // Day 1: Jan 1 (Holiday - skip)
    // Day 2: Jan 2 (Friday - work)
    // Jan 3-4 (Sat/Sun - weekend - skip)
    // Day 3: Jan 5 (Monday - work)
    // Result should be Monday Jan 5, 2026.
    const start = new Date('2025-12-31T12:00:00Z');
    const result = await service.addWorkingDays('cal-uae', start, 2);

    expect(result.toISOString().split('T')[0]).toBe('2026-01-05');
  });

  it('runs database queries when pg pool is present', async () => {
    const mockQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('aura_working_calendars')) {
        return { rows: [{ weekends: [0, 6], standard_hours: 8 }] };
      }
      if (sql.includes('aura_calendar_holidays')) {
        return { rows: [] }; // no holiday
      }
      if (sql.includes('aura_calendar_adjustments')) {
        return { rows: [{ hours: 6.00 }] }; // Ramadan hours adjust
      }
      return { rows: [] };
    });

    const mockPool = {
      query: mockQuery,
    } as unknown as Pool;

    const service = new CalendarService(mockPool);
    const hours = await service.getWorkingHoursForDay('cal-uae', new Date('2026-03-10'));

    expect(mockQuery).toHaveBeenCalled();
    expect(hours).toBe(6);
  });
});
