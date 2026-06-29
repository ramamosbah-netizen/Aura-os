import { type Id, newId } from '@aura/shared';

/**
 * Staff Advance / salary loan — an employee borrows against future salary, repaid in installments
 * (typically deducted by payroll). Lifecycle: requested → approved → disbursed → settled, with
 * rejected as a terminal branch from requested. Repayments accrue against the principal; the
 * advance settles once fully repaid. Repayments cannot exceed the outstanding balance.
 */
export type StaffAdvanceStatus = 'requested' | 'approved' | 'rejected' | 'disbursed' | 'settled';

export interface StaffAdvance {
  id: Id;
  tenantId: Id;
  employeeId: Id;
  amount: number;
  reason: string;
  installments: number;
  amountRepaid: number;
  status: StaffAdvanceStatus;
  requestDate: string; // YYYY-MM-DD
  approvedBy: Id | null;
  disbursedDate: string | null;
  createdAt: string;
}

export interface NewStaffAdvance {
  tenantId: Id;
  employeeId: Id;
  amount: number;
  reason?: string;
  installments?: number;
  requestDate: string;
}

export function makeStaffAdvance(input: NewStaffAdvance): StaffAdvance {
  if (!input.employeeId) throw new Error('employeeId is required');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be positive');
  const installments = input.installments === undefined ? 1 : Number(input.installments);
  if (!Number.isInteger(installments) || installments < 1 || installments > 60) {
    throw new Error('installments must be an integer between 1 and 60');
  }
  if (!input.requestDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.requestDate)) throw new Error('requestDate must be YYYY-MM-DD');
  return {
    id: newId(),
    tenantId: input.tenantId,
    employeeId: input.employeeId,
    amount,
    reason: input.reason?.trim() || '',
    installments,
    amountRepaid: 0,
    status: 'requested',
    requestDate: input.requestDate,
    approvedBy: null,
    disbursedDate: null,
    createdAt: new Date().toISOString(),
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function approveAdvance(a: StaffAdvance, approverId: Id): StaffAdvance {
  if (a.status !== 'requested') throw new Error(`cannot approve from status ${a.status}`);
  if (!approverId) throw new Error('approverId is required');
  return { ...a, status: 'approved', approvedBy: approverId };
}

export function rejectAdvance(a: StaffAdvance): StaffAdvance {
  if (a.status !== 'requested') throw new Error(`cannot reject from status ${a.status}`);
  return { ...a, status: 'rejected' };
}

export function disburseAdvance(a: StaffAdvance, disbursedDate?: string): StaffAdvance {
  if (a.status !== 'approved') throw new Error(`cannot disburse from status ${a.status} — must be approved first`);
  return { ...a, status: 'disbursed', disbursedDate: disbursedDate ?? new Date().toISOString().slice(0, 10) };
}

/** Record an installment repayment; settles the advance once fully repaid. */
export function recordRepayment(a: StaffAdvance, amount: number): StaffAdvance {
  if (a.status !== 'disbursed') throw new Error(`cannot repay from status ${a.status} — must be disbursed first`);
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('repayment amount must be positive');
  const amountRepaid = round2(a.amountRepaid + amt);
  if (amountRepaid > a.amount + 0.001) throw new Error(`repayment exceeds outstanding balance (repaid ${a.amountRepaid}, principal ${a.amount})`);
  const status: StaffAdvanceStatus = amountRepaid >= a.amount - 0.001 ? 'settled' : 'disbursed';
  return { ...a, amountRepaid, status };
}

export function balanceOf(a: StaffAdvance): number {
  return round2(a.amount - a.amountRepaid);
}

/** Even installment amount (last one absorbs rounding). */
export function installmentAmount(a: StaffAdvance): number {
  return round2(a.amount / a.installments);
}

export const STAFF_ADVANCE_EVENT = {
  requested: 'hr.staff_advance.requested',
  approved: 'hr.staff_advance.approved',
  disbursed: 'hr.staff_advance.disbursed',
  repaid: 'hr.staff_advance.repaid',
} as const;
