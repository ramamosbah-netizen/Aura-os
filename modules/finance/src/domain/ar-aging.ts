import type { CustomerInvoice } from './customer-invoice';

/**
 * AR aging — buckets outstanding customer-invoice balances by how overdue they are, as of a
 * given date. Only issued / partially_paid invoices carry a receivable; the outstanding amount
 * is total − amountPaid. Age is measured from the due date (falling back to the issue date).
 */
export type AgingBucketKey = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export const AGING_BUCKETS: { key: AgingBucketKey; label: string }[] = [
  { key: 'current', label: 'Current' },
  { key: 'd1_30', label: '1–30' },
  { key: 'd31_60', label: '31–60' },
  { key: 'd61_90', label: '61–90' },
  { key: 'd90_plus', label: '90+' },
];

export type BucketTotals = Record<AgingBucketKey, number>;

export interface CustomerAging {
  customerName: string;
  buckets: BucketTotals;
  total: number;
}

export interface ArAgingReport {
  asOf: string;
  byCustomer: CustomerAging[];
  totals: BucketTotals;
  grandTotal: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function emptyBuckets(): BucketTotals {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
}

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);
}

export function bucketFor(daysOverdue: number): AgingBucketKey {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'd1_30';
  if (daysOverdue <= 60) return 'd31_60';
  if (daysOverdue <= 90) return 'd61_90';
  return 'd90_plus';
}

/** Build the AR aging report from customer invoices as of `asOf` (YYYY-MM-DD). */
export function buildArAging(invoices: CustomerInvoice[], asOf: string): ArAgingReport {
  const byName = new Map<string, BucketTotals>();
  const totals = emptyBuckets();

  for (const inv of invoices) {
    if (inv.status !== 'issued' && inv.status !== 'partially_paid') continue;
    const outstanding = round2(inv.total - inv.amountPaid);
    if (outstanding <= 0) continue;
    const ageFrom = inv.dueDate ?? inv.issueDate;
    const bucket = bucketFor(daysBetween(ageFrom, asOf));

    const row = byName.get(inv.customerName) ?? emptyBuckets();
    row[bucket] = round2(row[bucket] + outstanding);
    byName.set(inv.customerName, row);
    totals[bucket] = round2(totals[bucket] + outstanding);
  }

  const byCustomer: CustomerAging[] = [...byName.entries()]
    .map(([customerName, buckets]) => ({
      customerName,
      buckets,
      total: round2(Object.values(buckets).reduce((s, n) => s + n, 0)),
    }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = round2(Object.values(totals).reduce((s, n) => s + n, 0));
  return { asOf, byCustomer, totals, grandTotal };
}

/** Column order for the AR-aging CSV/BI export. */
export const AR_AGING_CSV_COLUMNS = ['customer', 'current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total'] as const;

/**
 * Flatten an AR-aging report to CSV rows — one row per customer (sorted by exposure) plus a
 * trailing TOTAL row. Pure, so the shape is unit-tested without spinning up the controller.
 */
export function arAgingCsvRows(report: ArAgingReport): Array<Record<string, string | number>> {
  const rows = report.byCustomer.map((c) => ({
    customer: c.customerName,
    current: c.buckets.current,
    d1_30: c.buckets.d1_30,
    d31_60: c.buckets.d31_60,
    d61_90: c.buckets.d61_90,
    d90_plus: c.buckets.d90_plus,
    total: c.total,
  }));
  rows.push({
    customer: 'TOTAL',
    current: report.totals.current,
    d1_30: report.totals.d1_30,
    d31_60: report.totals.d31_60,
    d61_90: report.totals.d61_90,
    d90_plus: report.totals.d90_plus,
    total: report.grandTotal,
  });
  return rows;
}
