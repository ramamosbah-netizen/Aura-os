import type { Invoice } from './invoice';
import { type AgingBucketKey, type BucketTotals, bucketFor } from './ar-aging';

/**
 * AP aging — the payables mirror of AR aging. Buckets the company's *unpaid* supplier liability
 * (approved invoices not yet paid) by how long they've been outstanding, measured from the
 * invoice date (`createdAt`). Grouped per supplier. Draft / paid / cancelled invoices are excluded.
 */
export interface SupplierAging {
  supplierName: string;
  buckets: BucketTotals;
  total: number;
}

export interface ApAgingReport {
  asOf: string;
  bySupplier: SupplierAging[];
  totals: BucketTotals;
  grandTotal: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function emptyBuckets(): BucketTotals {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
}

function daysBetween(fromIso: string, toDate: string): number {
  const fromDay = fromIso.slice(0, 10);
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}

/** Build the AP aging report from supplier invoices as of `asOf` (YYYY-MM-DD). */
export function buildApAging(invoices: Invoice[], asOf: string): ApAgingReport {
  const byName = new Map<string, BucketTotals>();
  const totals = emptyBuckets();

  for (const inv of invoices) {
    if (inv.status !== 'approved') continue; // only approved-but-unpaid is a live payable
    const amount = round2(inv.value);
    if (amount <= 0) continue;
    const bucket: AgingBucketKey = bucketFor(daysBetween(inv.createdAt, asOf));
    const name = inv.supplierName?.trim() || '(unnamed supplier)';

    const row = byName.get(name) ?? emptyBuckets();
    row[bucket] = round2(row[bucket] + amount);
    byName.set(name, row);
    totals[bucket] = round2(totals[bucket] + amount);
  }

  const bySupplier: SupplierAging[] = [...byName.entries()]
    .map(([supplierName, buckets]) => ({
      supplierName,
      buckets,
      total: round2(Object.values(buckets).reduce((s, n) => s + n, 0)),
    }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = round2(Object.values(totals).reduce((s, n) => s + n, 0));
  return { asOf, bySupplier, totals, grandTotal };
}

/** Column order for the AP-aging CSV/BI export. */
export const AP_AGING_CSV_COLUMNS = ['supplier', 'current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total'] as const;

/**
 * Flatten an AP-aging report to CSV rows — one row per supplier (sorted by exposure) plus a
 * trailing TOTAL row. Pure, so the shape is unit-tested without spinning up the controller.
 */
export function apAgingCsvRows(report: ApAgingReport): Array<Record<string, string | number>> {
  const rows = report.bySupplier.map((s) => ({
    supplier: s.supplierName,
    current: s.buckets.current,
    d1_30: s.buckets.d1_30,
    d31_60: s.buckets.d31_60,
    d61_90: s.buckets.d61_90,
    d90_plus: s.buckets.d90_plus,
    total: s.total,
  }));
  rows.push({
    supplier: 'TOTAL',
    current: report.totals.current,
    d1_30: report.totals.d1_30,
    d31_60: report.totals.d31_60,
    d61_90: report.totals.d61_90,
    d90_plus: report.totals.d90_plus,
    total: report.grandTotal,
  });
  return rows;
}
