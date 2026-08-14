import { type Id, newId, moneyNumber as r2 } from '@aura/shared';
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
  /** Soft-delete marker — deleted budgets are hidden from finds but restorable. */
  deletedAt: string | null;
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
    lines: input.lines.map((l) => {
      // Validate rather than silently coerce: `Number(x) || 0` turned a NaN/undefined amount into
      // a budgeted 0, hiding bad input as a real (wrong) figure. A budget line must be a number.
      const amount = Number(l.amount);
      if (!Number.isFinite(amount)) throw new Error(`budget line amount must be a number (got ${String(l.amount)})`);
      return { accountId: l.accountId, accountCode: l.accountCode, accountName: l.accountName, amount: r2(amount) };
    }),
    deletedAt: null,
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
  /** True when the GL moved on this account but no budget line planned for it. */
  unbudgeted: boolean;
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
  /** Actual spend/income on accounts with no budget line at all — the overspend a plan didn't see. */
  totalUnbudgeted: number;
}

/**
 * Fold a budget against the GL actuals for its date range. Variance = budget − actual
 * (positive = under budget for an expense line; the UI colours by account type).
 *
 * **Unbudgeted spend is included.** The report used to iterate the budget's own lines only, so
 * money spent on an account nobody had planned for was invisible: a 10,000 rent budget with 8,000
 * of rent and 50,000 of unbudgeted consultancy reported "2,000 under budget" while the business
 * was 48,000 over. That is the single failure a budget-control report exists to prevent — the
 * overspend you most need to see was the one it could not show.
 *
 * P&L accounts (revenue/expense) that moved in the period now appear with a zero budget and are
 * flagged `unbudgeted`. Balance-sheet accounts are not swept in — a budget plans performance, not
 * position — but a budgeted account of any type is always shown, because someone planned it.
 */
export function buildBudgetVsActual(budget: Budget, accounts: Account[], journals: Journal[]): BudgetVsActual {
  const balances = accountBalances(accounts, journals, budget.from, budget.to);
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const budgeted = new Set(budget.lines.map((l) => l.accountId));

  let totalBudget = 0;
  let totalActual = 0;
  let totalUnbudgeted = 0;

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
      unbudgeted: false,
    };
  });

  for (const a of accounts) {
    if (budgeted.has(a.id)) continue;
    if (a.type !== 'expense' && a.type !== 'revenue') continue;
    const actual = r2(balances.get(a.id) ?? 0);
    if (actual === 0) continue;
    totalActual += actual;
    totalUnbudgeted += actual;
    rows.push({
      accountId: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      budget: 0,
      actual,
      variance: r2(-actual), // every unbudgeted dirham is variance
      variancePct: null,     // no budget to be a percentage of
      unbudgeted: true,
    });
  }

  rows.sort((x, y) => x.code.localeCompare(y.code));

  return {
    budgetId: budget.id,
    name: budget.name,
    from: budget.from,
    to: budget.to,
    rows,
    totalBudget: r2(totalBudget),
    totalActual: r2(totalActual),
    totalVariance: r2(totalBudget - totalActual),
    totalUnbudgeted: r2(totalUnbudgeted),
  };
}
