import { type Id, newId } from '@aura/shared';

// ============================================================
// Finance — Period Close
// ------------------------------------------------------------
// Locking a fiscal period (a calendar month, 'YYYY-MM') so no further journals can be
// posted into it — the control that turns the ledger into a closed set of books. A period
// is "closed" iff a PeriodClose row exists for (tenant, period); reopening deletes it.
// ============================================================

export interface PeriodClose {
  id: Id;
  tenantId: Id;
  period: string; // 'YYYY-MM'
  closedAt: string;
  closedBy: Id | null;
  note: string | null;
}

export interface NewPeriodClose {
  tenantId: Id;
  period: string;
  closedBy?: Id | null;
  note?: string | null;
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The fiscal period ('YYYY-MM') an ISO date/timestamp falls in. */
export function periodOf(isoDate: string): string {
  return (isoDate || '').slice(0, 7);
}

export function isValidPeriod(period: string): boolean {
  return PERIOD_RE.test(period);
}

export function makePeriodClose(input: NewPeriodClose): PeriodClose {
  const period = (input.period || '').trim();
  if (!isValidPeriod(period)) {
    throw new Error(`Invalid period "${input.period}" — expected YYYY-MM`);
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    period,
    closedAt: new Date().toISOString(),
    closedBy: input.closedBy ?? null,
    note: input.note?.trim() || null,
  };
}

export const PERIOD_CLOSE_EVENT = {
  closed: 'finance.period.closed',
  reopened: 'finance.period.reopened',
} as const;
