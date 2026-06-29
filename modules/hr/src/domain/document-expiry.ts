import type { Employee } from './employee';

// Employee document-expiry — a read-model over the workforce's statutory documents (UAE
// residence visa + labour permit). Framework-free + pure: buckets each document by days to
// expiry so HR can act before a worker falls out of compliance (MoHRE / ICP renewals).

export type ExpiryBucket = 'expired' | 'critical' | 'warning' | 'ok';
export type ExpiryDocumentType = 'Residence Visa' | 'Labour Permit';

export interface ExpiryItem {
  employeeId: string;
  employeeName: string;
  role: string;
  department: string;
  documentType: ExpiryDocumentType;
  expiryDate: string; // YYYY-MM-DD
  daysToExpiry: number; // negative once expired
  bucket: ExpiryBucket;
}

export interface ExpiryCounts {
  expired: number;
  critical: number;
  warning: number;
  ok: number;
  total: number;
}

export interface ExpiryReport {
  asOf: string; // YYYY-MM-DD
  criticalDays: number;
  warningDays: number;
  items: ExpiryItem[];
  counts: ExpiryCounts;
}

export interface ExpiryOptions {
  /** Reference date (YYYY-MM-DD); defaults to today (UTC calendar day). */
  asOf?: string;
  /** ≤ this many days (and not yet expired) ⇒ 'critical'. Default 30. */
  criticalDays?: number;
  /** ≤ this many days ⇒ 'warning' (above critical). Default 90. */
  warningDays?: number;
}

/** Parse a YYYY-MM-DD calendar date to a UTC-midnight epoch (drift-free, TZ-independent). */
function calendarUtc(date: string): number {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

function bucketFor(daysToExpiry: number, criticalDays: number, warningDays: number): ExpiryBucket {
  if (daysToExpiry < 0) return 'expired';
  if (daysToExpiry <= criticalDays) return 'critical';
  if (daysToExpiry <= warningDays) return 'warning';
  return 'ok';
}

/**
 * Build the document-expiry report for a set of employees. Terminated employees are excluded
 * (their documents are no longer the company's compliance concern); each present visa/permit
 * expiry becomes one item, sorted most-urgent-first.
 */
export function documentExpiryReport(employees: Employee[], options: ExpiryOptions = {}): ExpiryReport {
  const asOf = options.asOf?.slice(0, 10) || todayUtc();
  const criticalDays = options.criticalDays ?? 30;
  const warningDays = options.warningDays ?? 90;
  const asOfUtc = calendarUtc(asOf);

  const items: ExpiryItem[] = [];
  for (const e of employees) {
    if (e.status === 'terminated') continue;
    const name = `${e.firstName} ${e.lastName}`.trim();
    const docs: Array<{ type: ExpiryDocumentType; date: string | null }> = [
      { type: 'Residence Visa', date: e.visaExpiry },
      { type: 'Labour Permit', date: e.permitExpiry },
    ];
    for (const doc of docs) {
      if (!doc.date) continue;
      const daysToExpiry = Math.floor((calendarUtc(doc.date) - asOfUtc) / DAY_MS);
      items.push({
        employeeId: e.id,
        employeeName: name,
        role: e.role,
        department: e.department,
        documentType: doc.type,
        expiryDate: doc.date.slice(0, 10),
        daysToExpiry,
        bucket: bucketFor(daysToExpiry, criticalDays, warningDays),
      });
    }
  }

  items.sort((a, b) => a.daysToExpiry - b.daysToExpiry);

  const counts: ExpiryCounts = { expired: 0, critical: 0, warning: 0, ok: 0, total: items.length };
  for (const it of items) counts[it.bucket] += 1;

  return { asOf, criticalDays, warningDays, items, counts };
}
