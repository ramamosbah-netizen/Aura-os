import type { Employee } from './employee';

/**
 * Staff document expiry — a pure, stateless compliance watch-list (no new table) computed over
 * the employee record's `visaExpiry` / `permitExpiry`. UAE labour compliance hinges on these not
 * lapsing; this surfaces documents already expired or expiring within a window, soonest first, so
 * PRO/HR can renew in time. Mirrors the bank-guarantee expiry watch-list.
 */
export type DocumentType = 'visa' | 'work_permit';
export type ExpiryStatus = 'expired' | 'expiring' | 'valid';

export interface ExpiringDocument {
  employeeId: string;
  employeeName: string;
  documentType: DocumentType;
  expiryDate: string; // YYYY-MM-DD
  daysToExpiry: number; // negative once past expiry
  status: ExpiryStatus;
}

export interface DocumentExpiryReport {
  asOf: string;
  withinDays: number;
  items: ExpiringDocument[];
  expiredCount: number;
  expiringCount: number;
}

/** Whole days from `asOf` to `expiry` (both YYYY-MM-DD); negative once past expiry. */
export function daysUntil(expiry: string, asOf: string): number {
  return Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000);
}

function classify(days: number, withinDays: number): ExpiryStatus {
  if (days < 0) return 'expired';
  if (days <= withinDays) return 'expiring';
  return 'valid';
}

/**
 * Build the watch-list as of `asOf` (YYYY-MM-DD), including only documents that are expired or
 * expiring within `withinDays` (active employees only; valid-and-far-off documents are omitted).
 */
export function buildDocumentExpiryReport(employees: Employee[], asOf: string, withinDays = 90): DocumentExpiryReport {
  const items: ExpiringDocument[] = [];

  for (const e of employees) {
    if (e.status !== 'active') continue;
    const name = `${e.firstName} ${e.lastName}`.trim();
    const checks: Array<[DocumentType, string | null]> = [
      ['visa', e.visaExpiry],
      ['work_permit', e.permitExpiry],
    ];
    for (const [documentType, expiryDate] of checks) {
      if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) continue;
      const daysToExpiry = daysUntil(expiryDate, asOf);
      const status = classify(daysToExpiry, withinDays);
      if (status === 'valid') continue;
      items.push({ employeeId: e.id, employeeName: name, documentType, expiryDate, daysToExpiry, status });
    }
  }

  items.sort((a, b) => a.daysToExpiry - b.daysToExpiry); // most overdue / soonest first
  return {
    asOf,
    withinDays,
    items,
    expiredCount: items.filter((i) => i.status === 'expired').length,
    expiringCount: items.filter((i) => i.status === 'expiring').length,
  };
}
