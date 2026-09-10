import { type WorkingCalendar, eachDay, workingCalendarOf } from './domain/working-calendar';

/**
 * §22 Step 8 — the bridge from `@aura/core`'s `CalendarService` to a resolved `WorkingCalendar`.
 *
 * This is the impure half of calendar integration: it CONSUMES the kernel calendar (weekends,
 * public holidays, Ramadan adjustments) rather than re-implementing one (Design Gate §3, §5.2 #5),
 * and hands the pure engine a plain predicate over an interval. The engine never learns a calendar
 * service exists.
 *
 * Structurally typed on purpose. `CalendarService.getWorkingHoursForDay` satisfies
 * `WorkingHoursSource`, so this neither imports Nest nor couples the resolver to a concrete service —
 * and it is provable against the in-memory `CalendarService` (weekends + holidays, no database),
 * which is why Step 8's calendar proof does not wait for Postgres the way Step 7's cross-project
 * proof does.
 */

/** The one thing this bridge needs from a calendar: how many hours are worked on a given day. */
export interface WorkingHoursSource {
  getWorkingHoursForDay(calendarId: string, date: Date): Promise<number>;
}

/**
 * Resolve a `WorkingCalendar` for `[from, to]` from a working-hours source.
 *
 * A day counts as working when it has more than zero hours — which folds weekends (0 hours),
 * holidays (0 hours) and a genuine shutdown into one honest answer, while a Ramadan-adjusted day
 * (fewer hours, still > 0) stays a working day. Days are probed at NOON UTC so the source's
 * local-time weekday and its UTC date string agree on which calendar day is meant, across every
 * timezone the app runs in.
 */
export async function resolveWorkingCalendar(
  source: WorkingHoursSource,
  calendarId: string,
  interval: { from: string; to: string },
): Promise<WorkingCalendar> {
  const nonWorking: string[] = [];
  for (const day of eachDay(interval.from, interval.to)) {
    const hours = await source.getWorkingHoursForDay(calendarId, new Date(`${day}T12:00:00Z`));
    if (!(hours > 0)) nonWorking.push(day);
  }
  return workingCalendarOf(nonWorking);
}
