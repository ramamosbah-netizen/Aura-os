/**
 * THE BUSINESS DATE — which calendar day it is for the company, not for UTC.
 *
 * `new Date().toISOString().slice(0, 10)` answers "what day is it in UTC". For a UAE company that is
 * the wrong day for four hours every night: from 00:00 to 04:00 in Dubai it is still yesterday in
 * UTC, so a site diary written just after midnight defaulted to the day before (J4-02), an invoice
 * aged against yesterday, and an obligation due "today" was not yet due. Every default, "as of" and
 * "is it overdue" that means TODAY means today where the business is.
 *
 * The zone is pinned to the one the web app already displays every business date in
 * (`DISPLAY_TIME_ZONE` in apps/web/lib/locale.ts — a parity test holds the two together), so the
 * date a person sees on screen and the date the server defaults, compares and ages against are the
 * same date. The tenant's `locale.timezone` setting is not read yet; when it is, it replaces this
 * constant in both places at once.
 *
 * Use it only where "now" becomes a date. Arithmetic on date-only values (a due date plus 30 days)
 * is calendar arithmetic and stays in UTC, where a day is always 24 hours.
 */
export const BUSINESS_TIME_ZONE = 'Asia/Dubai';

const formatter = new Intl.DateTimeFormat('en', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD: the company's calendar day at `at` (default: now). */
export function businessDate(at: Date = new Date()): string {
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** YYYY-MM-DD: the company's calendar day `days` days from `from` (default: now). The zone keeps no daylight saving, so a day is 24 hours. */
export function businessDateInDays(days: number, from: Date = new Date()): string {
  return businessDate(new Date(from.getTime() + days * 86_400_000));
}
