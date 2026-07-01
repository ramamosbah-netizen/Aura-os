/**
 * Leave-balance accrual — computed (no table): an employee accrues `annualDays` pro-rata from
 * their join date; approved leave consumes it. remaining = accrued − taken.
 */
export interface LeaveInput { startDate: string; endDate: string; status: string }

export interface LeaveBalance {
  annualDays: number;
  asOf: string;
  monthsWorked: number;
  accrued: number;   // annualDays × monthsWorked / 12
  taken: number;     // sum of approved leave days (inclusive)
  remaining: number; // accrued − taken
}

/** Whole days between two YYYY-MM-DD dates, inclusive of both ends. */
export function leaveDays(startDate: string, endDate: string): number {
  const d = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000);
  return d >= 0 ? d + 1 : 0;
}

function monthsBetween(from: string, to: string): number {
  const a = new Date(from), b = new Date(to);
  const m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1);
  return Math.max(0, m);
}

export function computeLeaveBalance(input: { annualDays: number; joinedDate: string; asOf: string; leaves: LeaveInput[] }): LeaveBalance {
  const annualDays = Number(input.annualDays);
  if (!Number.isFinite(annualDays) || annualDays < 0) throw new Error('annualDays must be zero or positive');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.joinedDate)) throw new Error('joinedDate must be YYYY-MM-DD');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOf)) throw new Error('asOf must be YYYY-MM-DD');
  const monthsWorked = monthsBetween(input.joinedDate, input.asOf);
  const accrued = Math.round((annualDays * monthsWorked / 12) * 100) / 100;
  const taken = input.leaves.filter((l) => l.status === 'approved').reduce((s, l) => s + leaveDays(l.startDate, l.endDate), 0);
  return { annualDays, asOf: input.asOf, monthsWorked, accrued, taken, remaining: Math.round((accrued - taken) * 100) / 100 };
}
