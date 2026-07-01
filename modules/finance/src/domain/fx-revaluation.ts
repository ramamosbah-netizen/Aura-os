/**
 * FX revaluation — unrealized gain/loss on open foreign-currency AR at a period-end rate.
 * For each open (issued/partially_paid) non-base invoice: outstanding is revalued from its
 * booked rate to the current rate; delta = base@current − base@booked (positive = gain).
 */
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

export interface FxRevaluation {
  asOf: string;
  baseCurrency: string;
  lines: RevalLine[];
  totalGainLoss: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const OPEN = new Set(['issued', 'partially_paid']);

/** rateFor: current rate (foreign→base) per currency. Base-currency invoices are excluded. */
export function computeFxRevaluation(
  invoices: RevalInvoice[],
  rateFor: (currency: string) => number,
  asOf: string,
  baseCurrency = 'AED',
): FxRevaluation {
  const lines: RevalLine[] = [];
  for (const inv of invoices) {
    if (!OPEN.has(inv.status)) continue;
    if (!inv.currency || inv.currency === baseCurrency) continue;
    const outstanding = r2(inv.total - inv.amountPaid);
    if (outstanding <= 0) continue;
    const bookedRate = Number(inv.exchangeRate) || 1;
    const currentRate = Number(rateFor(inv.currency)) || bookedRate;
    const baseAtBooked = r2(outstanding * bookedRate);
    const baseAtCurrent = r2(outstanding * currentRate);
    lines.push({
      invoiceNumber: inv.invoiceNumber, currency: inv.currency, outstanding,
      bookedRate, currentRate, baseAtBooked, baseAtCurrent, gainLoss: r2(baseAtCurrent - baseAtBooked),
    });
  }
  return { asOf, baseCurrency, lines, totalGainLoss: r2(lines.reduce((s, l) => s + l.gainLoss, 0)) };
}
