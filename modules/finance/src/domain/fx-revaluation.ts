/**
 * FX revaluation — unrealized gain/loss on open foreign-currency AR at a period-end rate.
 * For each open (issued/partially_paid) non-base invoice: outstanding is revalued from its
 * booked rate to the current rate; delta = base@current − base@booked (positive = gain).
 */
import { moneyNumber as r2, convertMoney } from '@aura/shared';

export interface RevalInvoice {
  invoiceNumber: string;
  currency: string;
  exchangeRate: number; // booked rate → base
  total: number;
  amountPaid: number;
  status: string;
}

export interface RevalLine {
  invoiceNumber: string;
  currency: string;
  outstanding: number;   // foreign-currency outstanding
  bookedRate: number;
  currentRate: number;
  baseAtBooked: number;
  baseAtCurrent: number;
  gainLoss: number;      // base@current − base@booked
}

/** An open invoice that COULD NOT be revalued, and why. Never silently dropped and never zeroed. */
export interface UnrevaluedInvoice {
  invoiceNumber: string;
  currency: string;
  outstanding: number;
  reason: 'no_governed_rate' | 'no_booked_rate';
  detail: string;
}

export interface FxRevaluation {
  asOf: string;
  baseCurrency: string;
  lines: RevalLine[];
  totalGainLoss: number;
  /**
   * Open exposure this revaluation could not measure.
   *
   * The total above is the gain/loss on the lines ONLY. When this array is non-empty the
   * revaluation is INCOMPLETE — some open foreign-currency exposure was not valued — and it must
   * not be posted to the ledger. `complete` states that outright so no caller has to infer it from
   * an array length.
   */
  unresolved: UnrevaluedInvoice[];
  complete: boolean;
}

const AR_OPEN = ['issued', 'partially_paid'];

/**
 * rateFor: the GOVERNED current rate (foreign→base) per currency, or NULL when none is governed at
 * `asOf`. Base-currency invoices are excluded because there is nothing to revalue.
 *
 * Null is the load-bearing part (FX-01). This used to take a plain number and fall back to the
 * BOOKED rate when it got nothing — `Number(rateFor(c)) || bookedRate` — which made an unmeasurable
 * exposure indistinguishable from one that had genuinely not moved: gain/loss 0, no journal, and a
 * report saying the position was flat. An exposure that cannot be measured is now reported as
 * unmeasured.
 */
export function computeFxRevaluation(
  invoices: RevalInvoice[],
  rateFor: (currency: string) => number | null,
  asOf: string,
  baseCurrency = 'AED',
  openStatuses: string[] = AR_OPEN,
): FxRevaluation {
  const OPEN = new Set(openStatuses);
  const lines: RevalLine[] = [];
  const unresolved: UnrevaluedInvoice[] = [];
  for (const inv of invoices) {
    if (!OPEN.has(inv.status)) continue;
    if (!inv.currency || inv.currency === baseCurrency) continue;
    const outstanding = r2(inv.total - inv.amountPaid);
    if (outstanding <= 0) continue;
    // The BOOKED rate is historical fact read off the document. It is never re-resolved here: the
    // invoice was valued at the rate governing on its own date, and revaluation compares against
    // that, not against a fresh opinion of what that date's rate was.
    const bookedRate = Number(inv.exchangeRate);
    if (!Number.isFinite(bookedRate) || bookedRate <= 0) {
      unresolved.push({
        invoiceNumber: inv.invoiceNumber, currency: inv.currency, outstanding, reason: 'no_booked_rate',
        detail: `${inv.invoiceNumber} carries no usable booked rate, so its movement since booking cannot be measured`,
      });
      continue;
    }
    const currentRate = rateFor(inv.currency);
    if (currentRate === null || !Number.isFinite(currentRate) || currentRate <= 0) {
      unresolved.push({
        invoiceNumber: inv.invoiceNumber, currency: inv.currency, outstanding, reason: 'no_governed_rate',
        detail: `no governed ${inv.currency}/${baseCurrency} rate at ${asOf}, so ${inv.invoiceNumber} cannot be revalued`,
      });
      continue;
    }
    const baseAtBooked = Number(convertMoney(outstanding, bookedRate));
    const baseAtCurrent = Number(convertMoney(outstanding, currentRate));
    lines.push({
      invoiceNumber: inv.invoiceNumber, currency: inv.currency, outstanding,
      bookedRate, currentRate, baseAtBooked, baseAtCurrent, gainLoss: r2(baseAtCurrent - baseAtBooked),
    });
  }
  return {
    asOf, baseCurrency, lines, unresolved,
    totalGainLoss: r2(lines.reduce((s, l) => s + l.gainLoss, 0)),
    complete: unresolved.length === 0,
  };
}
