import { describe, it, expect } from 'vitest';
import {
  ALL_DAYS_WORKING,
  eachDay,
  workingCalendarOf,
  workingDaysInRange,
} from './working-calendar';

describe('working-calendar — the calendar as data', () => {
  it('ALL_DAYS_WORKING treats every day as worked — the no-calendar assertion', () => {
    expect(ALL_DAYS_WORKING.isWorkingDay('2026-03-13')).toBe(true);
    expect(ALL_DAYS_WORKING.isWorkingDay('2026-01-01')).toBe(true);
  });

  it('workingCalendarOf marks named days off and everything else on', () => {
    const cal = workingCalendarOf(['2026-03-13', '2026-03-14']); // a Fri/Sat weekend
    expect(cal.isWorkingDay('2026-03-12')).toBe(true);
    expect(cal.isWorkingDay('2026-03-13')).toBe(false);
    expect(cal.isWorkingDay('2026-03-14')).toBe(false);
    expect(cal.isWorkingDay('2026-03-15')).toBe(true);
  });

  it('normalises to the date part, so a timestamp resolves to its day', () => {
    const cal = workingCalendarOf(['2026-03-13T00:00:00Z']);
    expect(cal.isWorkingDay('2026-03-13T09:30:00Z')).toBe(false);
  });

  it('eachDay enumerates an inclusive range in date order, spanning month ends', () => {
    expect(eachDay('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(eachDay('2026-03-10', '2026-03-10')).toEqual(['2026-03-10']);
  });

  it('workingDaysInRange drops the off days, keeps order, defaults to all-working', () => {
    const cal = workingCalendarOf(['2026-03-13', '2026-03-14']);
    expect(workingDaysInRange('2026-03-12', '2026-03-16', cal)).toEqual(['2026-03-12', '2026-03-15', '2026-03-16']);
    expect(workingDaysInRange('2026-03-13', '2026-03-14', cal)).toEqual([]); // a weekend-only span
    expect(workingDaysInRange('2026-03-12', '2026-03-16')).toHaveLength(5); // no calendar = every day
  });
});
