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
  approvedBy: Id | null;
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
    approvedBy: null,
    reimbursedDate: null,
    createdAt: new Date().toISOString(),
  };
}

export function submitClaim(claim: ExpenseClaim): ExpenseClaim {
  if (claim.status !== 'draft') throw new Error(`cannot submit from status ${claim.status}`);
  return { ...claim, status: 'submitted' };
}

export function approveClaim(claim: ExpenseClaim, approverId: Id): ExpenseClaim {
  if (claim.status !== 'submitted') throw new Error(`cannot approve from status ${claim.status}`);
  if (!approverId) throw new Error('approverId is required');
  return { ...claim, status: 'approved', approvedBy: approverId };
}

export function rejectClaim(claim: ExpenseClaim): ExpenseClaim {
  if (claim.status !== 'submitted') throw new Error(`cannot reject from status ${claim.status}`);
  return { ...claim, status: 'rejected' };
}

/** Mark an approved claim as paid out — the terminal step that ties to Finance. */
export function reimburseClaim(claim: ExpenseClaim, reimbursedDate?: string): ExpenseClaim {
  if (claim.status !== 'approved') throw new Error(`cannot reimburse from status ${claim.status} — must be approved first`);
  return { ...claim, status: 'reimbursed', reimbursedDate: reimbursedDate ?? new Date().toISOString().slice(0, 10) };
}
