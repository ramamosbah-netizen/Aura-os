/**
 * §22 Step 8 — the working calendar, as DATA.
 *
 * Design Gate §5.2 #5: the working calendar is CONSUMED (`@aura/core`), not assumed — otherwise a
 * plan works through Fridays and Eid. And Design Gate §5.1: the pure engine must never import a
 * calendar service; it receives resolved facts. Both hold at once only if the calendar arrives as a
 * value the engine can ask a synchronous, total question of.
 *
 * That value is `WorkingCalendar`: a predicate over YYYY-MM-DD days. The bridge that fills it from
 * `@aura/core`'s `CalendarService` (weekends, holidays, Ramadan adjustments) is the impure half and
 * lives in `resource-calendar.ts`; everything here is pure and has no idea a database exists.
 *
 * The default is `ALL_DAYS_WORKING` — every day works. That is a CALLER'S ASSERTION, not a fact this
 * module invents, exactly as the planner treats an empty `nonWorkingDays`: passing no calendar means
 * "treat every day as worked", and it keeps every pre-Step-8 caller behaving as it did.
 */

export interface WorkingCalendar {
  /** Is `day` (YYYY-MM-DD) a working day under this calendar? */
  isWorkingDay(day: string): boolean;
}

/** Every day is a working day — the "no calendar supplied" assertion, never an invented fact. */
export const ALL_DAYS_WORKING: WorkingCalendar = { isWorkingDay: () => true };

/**
 * A calendar defined by the days that are OFF.
 *
 * Non-working days are the resolved output of a real calendar over an interval — weekends, public
 * holidays, a maintenance shutdown. Anything not named is worked.
 */
export function workingCalendarOf(nonWorkingDays: Iterable<string>): WorkingCalendar {
  const off = new Set<string>();
  for (const d of nonWorkingDays) off.add(d.slice(0, 10));
  return { isWorkingDay: (day: string): boolean => !off.has(day.slice(0, 10)) };
}

/** Every date in an inclusive range, in date order. Calendar days — working or not. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to.slice(0, 10)}T00:00:00Z`).getTime();
  for (
    const d = new Date(`${from.slice(0, 10)}T00:00:00Z`);
    d.getTime() <= end;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** The WORKING days of an inclusive range, in date order. Non-working days are dropped. */
export function workingDaysInRange(
  from: string,
  to: string,
  calendar: WorkingCalendar = ALL_DAYS_WORKING,
): string[] {
  return eachDay(from, to).filter((d) => calendar.isWorkingDay(d));
}

/**
 * Working days between two dates, SIGNED: positive when `to` is later than `from`.
 *
 * Lives here rather than beside any one caller because a variance is only comparable when every
 * figure on the project counts days the same way. A forecast that is "four days late" and a
 * milestone that is "four days late" must mean the same four days, and the way that stops being
 * true is two modules each rounding their own way.
 */
export function signedWorkingDays(from: string, to: string, calendar: WorkingCalendar = ALL_DAYS_WORKING): number {
  if (from === to) return 0;
  const earlier = from < to ? from : to;
  const later = from < to ? to : from;
  // Inclusive of both ends, so the count of days BETWEEN them is one less.
  const between = Math.max(0, workingDaysInRange(earlier, later, calendar).length - 1);
  return between === 0 ? 0 : from < to ? between : -between;
}
