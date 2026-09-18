import { type Id, newId, moneyNumber as round2 } from '@aura/shared';

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
  /** Who refused it, and when. A refusal an employee feels, attributable to nobody. */
  rejectedBy: Id | null;
  rejectedAt: string | null;
  /** Who released the cash. The row kept a DATE and no actor. */
  disbursedBy: Id | null;
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
    rejectedBy: null,
    rejectedAt: null,
    disbursedBy: null,
    disbursedDate: null,
    createdAt: new Date().toISOString(),
  };
}


/**
 * APPROVE the advance — the act that commits this business to hand an employee cash.
 *
 * THE EMPLOYEE MAY NOT APPROVE THEIR OWN. `requestorUserId` is the employee's LINKED ACCOUNT,
 * resolved by the caller, because `employeeId` is the employee RECORD's id and the approver is a
 * USER id. Where there is no link the check cannot run and says so rather than implying a control.
 */
export function approveAdvance(a: StaffAdvance, approverId: Id, requestorUserId?: Id | null): StaffAdvance {
  if (a.status !== 'requested') throw new Error(`cannot approve from status ${a.status}`);
  if (!approverId) throw new Error('approverId is required');
  if (requestorUserId && approverId === requestorUserId) {
    throw new Error('the employee who requested this advance may not approve their own request — a second person is what makes it an approval');
  }
  return { ...a, status: 'approved', approvedBy: approverId };
}

export function rejectAdvance(a: StaffAdvance, rejectedBy: Id | null = null): StaffAdvance {
  if (a.status !== 'requested') throw new Error(`cannot reject from status ${a.status}`);
  return { ...a, status: 'rejected', rejectedBy, rejectedAt: new Date().toISOString() };
}

/** Hand over the cash. Approving says the advance is owed; disbursing says the money goes now. */
export function disburseAdvance(
  a: StaffAdvance,
  opts: { by?: Id | null; requestorUserId?: Id | null; date?: string } = {},
): StaffAdvance {
  const { by: disbursedBy = null, requestorUserId, date: disbursedDate } = opts;
  if (a.status !== 'approved') throw new Error(`cannot disburse from status ${a.status} — must be approved first`);
  if (disbursedBy && requestorUserId && disbursedBy === requestorUserId) {
    throw new Error('the employee who requested this advance may not disburse their own — paying is a separate hand from asking');
  }
  if (disbursedBy && a.approvedBy && disbursedBy === a.approvedBy) {
    throw new Error('the person who approved this advance may not release their own approval for payment — approving and paying are two signatures');
  }
  return { ...a, status: 'disbursed', disbursedBy, disbursedDate: disbursedDate ?? new Date().toISOString().slice(0, 10) };
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
