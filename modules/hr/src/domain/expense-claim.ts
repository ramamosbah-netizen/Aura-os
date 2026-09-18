import { type Id, newId } from '@aura/shared';

/**
 * Expense Claim — an employee reimbursement request. Lifecycle:
 * draft → submitted → approved → reimbursed, with rejected as a terminal branch from submitted.
 * Amount is in AED; an optional projectId charges the cost to a project.
 */
export type ExpenseClaimStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed';

export type ExpenseCategory = 'travel' | 'accommodation' | 'meals' | 'fuel' | 'materials' | 'other';

const CATEGORIES: ExpenseCategory[] = ['travel', 'accommodation', 'meals', 'fuel', 'materials', 'other'];

export interface ExpenseClaim {
  id: Id;
  tenantId: Id;
  employeeId: Id;
  projectId: Id | null;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string; // YYYY-MM-DD
  description: string;
  status: ExpenseClaimStatus;
  /** Who put it forward, and when. The transition took no actor, so nobody was named. */
  submittedBy: Id | null;
  submittedAt: string | null;
  approvedBy: Id | null;
  /** Who refused it, and when. A refusal that costs an employee money was attributable to nobody. */
  rejectedBy: Id | null;
  rejectedAt: string | null;
  /** Who released the money. The row kept a DATE and no actor. */
  reimbursedBy: Id | null;
  reimbursedDate: string | null;
  createdAt: string;
}

export interface NewExpenseClaim {
  tenantId: Id;
  employeeId: Id;
  projectId?: Id | null;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  description?: string;
}

export function makeExpenseClaim(input: NewExpenseClaim): ExpenseClaim {
  if (!input.employeeId) throw new Error('employeeId is required');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be positive');
  if (!CATEGORIES.includes(input.category)) throw new Error(`category must be one of: ${CATEGORIES.join(', ')}`);
  if (!input.expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.expenseDate)) throw new Error('expenseDate must be YYYY-MM-DD');

  return {
    id: newId(),
    tenantId: input.tenantId,
    employeeId: input.employeeId,
    projectId: input.projectId ?? null,
    category: input.category,
    amount,
    expenseDate: input.expenseDate,
    description: input.description?.trim() || '',
    status: 'draft',
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    rejectedBy: null,
    rejectedAt: null,
    reimbursedBy: null,
    reimbursedDate: null,
    createdAt: new Date().toISOString(),
  };
}

export function submitClaim(claim: ExpenseClaim, submittedBy: Id | null = null): ExpenseClaim {
  if (claim.status !== 'draft') throw new Error(`cannot submit from status ${claim.status}`);
  return { ...claim, status: 'submitted', submittedBy, submittedAt: new Date().toISOString() };
}

/**
 * APPROVE the claim — the act that turns an employee's receipt into money this business owes them.
 *
 * THE CLAIMANT MAY NOT APPROVE THEIR OWN. Unlike the purchase order (0360), the solution scope (0361)
 * and the subcontractor claim (0364), this rule was WRITEABLE all along and simply was not written:
 * `employeeId` has always been on the record and `approveClaim` never compared the approver to it.
 *
 * `claimantUserId` is the employee's LINKED ACCOUNT, resolved by the caller — `employeeId` is the
 * employee RECORD's id and the approver is a USER id, which are different identifiers for different
 * things. Where an employee has no linked account the check cannot run, and the claim is approved
 * with that said rather than with a control implied that did not happen.
 */
export function approveClaim(claim: ExpenseClaim, approverId: Id, claimantUserId?: Id | null): ExpenseClaim {
  if (claim.status !== 'submitted') throw new Error(`cannot approve from status ${claim.status}`);
  if (!approverId) throw new Error('approverId is required');
  if (claimantUserId && approverId === claimantUserId) {
    throw new Error('the employee who claimed this expense may not approve their own claim — a second person is what makes it an approval');
  }
  return { ...claim, status: 'approved', approvedBy: approverId };
}

export function rejectClaim(claim: ExpenseClaim, rejectedBy: Id | null = null): ExpenseClaim {
  if (claim.status !== 'submitted') throw new Error(`cannot reject from status ${claim.status}`);
  return { ...claim, status: 'rejected', rejectedBy, rejectedAt: new Date().toISOString() };
}

/**
 * Mark an approved claim as paid out — the terminal step that ties to Finance, and the money actually
 * leaving. The claimant may not pay themselves, and neither may the person who approved it: approving
 * says the expense is owed, reimbursing says the cash goes now.
 *
 * THE TRAILING ARGUMENTS ARE NAMED, not positional. This function used to take a DATE second; adding
 * an actor there meant an existing caller passing a date silently passed it as the payer, and both
 * are `string`, so TypeScript could not see it. One caller did exactly that and a test caught it. An
 * options object makes the mistake unrepresentable rather than merely fixed.
 */
export function reimburseClaim(
  claim: ExpenseClaim,
  opts: { by?: Id | null; claimantUserId?: Id | null; date?: string } = {},
): ExpenseClaim {
  const { by: reimbursedBy = null, claimantUserId, date: reimbursedDate } = opts;
  if (claim.status !== 'approved') throw new Error(`cannot reimburse from status ${claim.status} — must be approved first`);
  if (reimbursedBy && claimantUserId && reimbursedBy === claimantUserId) {
    throw new Error('the employee who claimed this expense may not reimburse their own claim — paying is a separate hand from claiming');
  }
  if (reimbursedBy && claim.approvedBy && reimbursedBy === claim.approvedBy) {
    throw new Error('the person who approved this claim may not release their own approval for payment — approving and paying are two signatures');
  }
  return {
    ...claim,
    status: 'reimbursed',
    reimbursedBy,
    reimbursedDate: reimbursedDate ?? new Date().toISOString().slice(0, 10),
  };
}

/** Was the claimant/approver separation actually CHECKED? Derived, never stored twice. */
export function claimSeparation(claim: ExpenseClaim, claimantUserId?: Id | null): 'enforced' | 'unverifiable' | null {
  if (claim.approvedBy === null) return null;
  return claimantUserId ? 'enforced' : 'unverifiable';
}
