/**
 * Date-window arithmetic for anything that expires, matures or falls due.
 *
 * Promoted to shared because it had been written **four** times independently — bank guarantees,
 * post-dated cheques, staff visas/permits, and contract bonds — plus a fifth variant in
 * `contract-bond.ts` that answered the same question a different way (string-comparing against a
 * computed limit date rather than counting days). HR's own header already admitted it "mirrors the
 * bank-guarantee expiry watch-list".
 *
 * A fifth copy was about to be written for compliance certificates (G-20). That is the point at
 * which duplication stops being an observation and becomes a decision, so this is the decision.
 *
 * Deliberately NOT a report builder. Each consumer keeps its own item and report shape — an
 * expiring visa and a maturing cheque carry different fields and read differently to different
 * people. What they share is the arithmetic and the three-state verdict, and that is all that is
 * shared here (ADR-0012, Rule of Three: the primitive has four consumers, a generic report
 * builder would have one).
 */

/**
 * `expired`  — the date has passed.
 * `expiring` — within the warning window, not yet passed.
 * `valid`    — beyond the window; nothing to do.
 */
export type ExpiryStatus = 'expired' | 'expiring' | 'valid';

/**
 * Whole days between two `YYYY-MM-DD` dates; negative once `to` is in the past relative to `from`.
 *
 * Both are anchored at `T00:00:00Z` so the result is a calendar-day count, not an elapsed-time
 * measurement. Without that anchor a value computed at 23:00 local time lands a day out, which is
 * precisely the kind of drift that makes a compliance certificate look valid on its expiry day.
 */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Whole days from `asOf` until `expiryDate`; negative once past. Reads better at call sites. */
export function daysUntil(expiryDate: string, asOf: string): number {
  return daysBetween(asOf, expiryDate);
}

/** The three-state verdict. `withinDays` is the warning window, inclusive. */
export function classifyExpiry(daysToExpiry: number, withinDays: number): ExpiryStatus {
  if (daysToExpiry < 0) return 'expired';
  if (daysToExpiry <= withinDays) return 'expiring';
  return 'valid';
}

/**
 * Whether an item belongs on a watch-list — **including ones already past their date**.
 *
 * This is the rule the bank-guarantee module had to be corrected into, and it is worth stating
 * once rather than rediscovering per module: an obligation that is already overdue is the most
 * urgent item on the list, not one that should quietly drop off it. A guarantee 43 days past
 * expiry is still consuming the facility limit and still accruing commission; a certificate 43
 * days past expiry means the system is operating without approval.
 */
export function isOnExpiryWatchlist(daysToExpiry: number, withinDays: number): boolean {
  return daysToExpiry <= withinDays;
}

/** Convenience: classify straight from dates. */
export function expiryStatusOn(expiryDate: string, asOf: string, withinDays: number): ExpiryStatus {
  return classifyExpiry(daysUntil(expiryDate, asOf), withinDays);
}

/** A `YYYY-MM-DD` string, rejecting anything that is not one. Dates arrive from imports and forms. */
export function isDateOnly(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
