import { type Id, newId } from '@aura/shared';
import type { Account, AccountType } from './account';
import type { Journal } from './journal';
import { accountBalances } from './statements';

// ============================================================
// Finance — Budgets & Budget-vs-Actual
// ------------------------------------------------------------
// A budget is a named plan over a date range with a budgeted amount per GL account.
// "Actual" is never stored — it is folded live from the general ledger for the same
// range, so budget-vs-actual is always consistent with the books.
// ============================================================

export interface BudgetLine {
  accountId: Id;
  accountCode: string;
  accountName: string;
  amount: number;
}

export interface Budget {
  id: Id;
  tenantId: Id;
  name: string;
  from: string; // 'YYYY-MM-DD' inclusive
  to: string;   // 'YYYY-MM-DD' inclusive
  lines: BudgetLine[];
  createdAt: string;
  createdBy: Id | null;
}

export interface NewBudgetLine {
  accountId: Id;
  accountCode: string;
  accountName: string;
  amount: number;
}

export interface NewBudget {
  tenantId: Id;
  name: string;
  from: string;
  to: string;
  lines: NewBudgetLine[];
  createdBy?: Id | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (n: number): number => Math.round(n * 100) / 100;

export function makeBudget(input: NewBudget): Budget {
  const name = (input.name || '').trim();
  if (!name) throw new Error('budget name is required');
  if (!DATE_RE.test(input.from) || !DATE_RE.test(input.to)) {
    throw new Error('budget from/to must be YYYY-MM-DD');
  }
  if (input.to < input.from) throw new Error('budget "to" must not precede "from"');
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error('a budget needs at least one line');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    name,
    from: input.from,
    to: input.to,
    lines: input.lines.map((l) => ({
      accountId: l.accountId,
      accountCode: l.accountCode,
      accountName: l.accountName,
      amount: r2(Number(l.amount) || 0),
    })),
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export interface BudgetVsActualRow {
  accountId: Id;
  code: string;
  name: string;
  type: AccountType | null;
  budget: number;
  actual: number;
  variance: number;       // budget − actual
  variancePct: number | null;
}

export interface BudgetVsActual {
  budgetId: Id;
  name: string;
  from: string;
  to: string;
  rows: BudgetVsActualRow[];
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
}

/**
 * Fold a budget against the GL actuals for its date range. Variance = budget − actual
 * (positive = under budget for an expense line; the UI colours by account type).
 */
export function buildBudgetVsActual(budget: Budget, accounts: Account[], journals: Journal[]): BudgetVsActual {
  const balances = accountBalances(accounts, journals, budget.from, budget.to);
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  let totalBudget = 0;
  let totalActual = 0;
  const rows: BudgetVsActualRow[] = budget.lines.map((line) => {
    const a = accountById.get(line.accountId);
    const actual = r2(balances.get(line.accountId) ?? 0);
    const variance = r2(line.amount - actual);
    totalBudget += line.amount;
    totalActual += actual;
    return {
      accountId: line.accountId,
      code: line.accountCode,
      name: line.accountName,
      type: a?.type ?? null,
      budget: line.amount,
      actual,
      variance,
      variancePct: line.amount !== 0 ? r2((variance / Math.abs(line.amount)) * 100) : null,
    };
  });

  return {
    budgetId: budget.id,
    name: budget.name,
    from: budget.from,
    to: budget.to,
    rows,
    totalBudget: r2(totalBudget),
    totalActual: r2(totalActual),
    totalVariance: r2(totalBudget - totalActual),
  };
}
