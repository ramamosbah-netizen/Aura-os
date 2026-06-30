import type { Account, AccountType } from './account';
import type { Journal } from './journal';

// ============================================================
// Financial Statements — derived purely from the General Ledger
// ------------------------------------------------------------
// The system of record is the double-entry journal. Every statement here is a
// fold over (chart of accounts × journal lines) — the trial balance and the
// three primary statements (Income Statement, Balance Sheet, Cash Flow). No
// heuristics, no separate read-model: if the GL balances, the statements balance.
//
// Sign convention by normal balance:
//   asset, expense   → debit-normal  (balance = debits − credits)
//   liability, equity, revenue → credit-normal (balance = credits − debits)
// ============================================================

const DEBIT_NORMAL: Record<AccountType, boolean> = {
  asset: true,
  expense: true,
  liability: false,
  equity: false,
  revenue: false,
};

export interface StatementLine {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
}

export interface TrialBalance {
  asOf: string | null;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export interface IncomeStatement {
  from: string | null;
  to: string | null;
  revenue: StatementLine[];
  totalRevenue: number;
  expenses: StatementLine[];
  totalExpenses: number;
  netProfit: number;
}

export interface BalanceSheet {
  asOf: string | null;
  assets: StatementLine[];
  totalAssets: number;
  liabilities: StatementLine[];
  totalLiabilities: number;
  equity: StatementLine[];
  retainedEarnings: number;
  totalEquity: number; // explicit equity + retained earnings
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
}

export interface CashFlow {
  from: string | null;
  to: string | null;
  openingCash: number;
  inflows: number;
  outflows: number;
  netChange: number;
  closingCash: number;
  cashAccounts: Array<{ code: string; name: string }>;
  byCounterpart: StatementLine[]; // cash attributed to each non-cash counterpart account
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Date portion (YYYY-MM-DD) of a journal's postedAt, for inclusive range filtering. */
function postedDate(j: Journal): string {
  return (j.postedAt || '').slice(0, 10);
}
function inRange(j: Journal, from?: string | null, to?: string | null): boolean {
  const d = postedDate(j);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

interface Totals {
  debit: number;
  credit: number;
}

/** Sum debits/credits per accountId across the journals in range. */
function aggregate(journals: Journal[], from?: string | null, to?: string | null): Map<string, Totals> {
  const acc = new Map<string, Totals>();
  for (const j of journals) {
    if (!inRange(j, from, to)) continue;
    for (const line of j.lines) {
      const t = acc.get(line.accountId) ?? { debit: 0, credit: 0 };
      t.debit += line.debit;
      t.credit += line.credit;
      acc.set(line.accountId, t);
    }
  }
  return acc;
}

/** Signed balance of an account given its normal side. */
function signedBalance(type: AccountType, t: Totals): number {
  return DEBIT_NORMAL[type] ? t.debit - t.credit : t.credit - t.debit;
}

/** Net income across the journals up to `to` (revenue credit-normal − expense debit-normal). */
function netIncome(accounts: Account[], journals: Journal[], from?: string | null, to?: string | null): number {
  const agg = aggregate(journals, from, to);
  let income = 0;
  for (const a of accounts) {
    const t = agg.get(a.id);
    if (!t) continue;
    if (a.type === 'revenue') income += t.credit - t.debit;
    else if (a.type === 'expense') income -= t.debit - t.credit;
  }
  return income;
}

/** A cash & cash-equivalent account: an asset whose name marks it as cash/bank/petty cash. */
export function isCashAccount(a: Account): boolean {
  return a.type === 'asset' && /\b(cash|bank|petty)\b/i.test(a.name);
}

// ── Trial Balance ───────────────────────────────────────────────────────────
export function buildTrialBalance(accounts: Account[], journals: Journal[], asOf?: string | null): TrialBalance {
  const agg = aggregate(journals, null, asOf);
  const rows: TrialBalanceRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const a of accounts) {
    const t = agg.get(a.id);
    if (!t || (t.debit === 0 && t.credit === 0)) continue;
    rows.push({ accountId: a.id, code: a.code, name: a.name, type: a.type, debit: r2(t.debit), credit: r2(t.credit) });
    totalDebit += t.debit;
    totalCredit += t.credit;
  }
  rows.sort((x, y) => x.code.localeCompare(y.code));
  return {
    asOf: asOf ?? null,
    rows,
    totalDebit: r2(totalDebit),
    totalCredit: r2(totalCredit),
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
  };
}

// ── Income Statement (P&L) ──────────────────────────────────────────────────
export function buildIncomeStatement(
  accounts: Account[],
  journals: Journal[],
  from?: string | null,
  to?: string | null,
): IncomeStatement {
  const agg = aggregate(journals, from, to);
  const revenue: StatementLine[] = [];
  const expenses: StatementLine[] = [];
  let totalRevenue = 0;
  let totalExpenses = 0;
  for (const a of accounts) {
    const t = agg.get(a.id);
    if (!t) continue;
    const amount = signedBalance(a.type, t);
    if (a.type === 'revenue' && amount !== 0) {
      revenue.push({ accountId: a.id, code: a.code, name: a.name, amount: r2(amount) });
      totalRevenue += amount;
    } else if (a.type === 'expense' && amount !== 0) {
      expenses.push({ accountId: a.id, code: a.code, name: a.name, amount: r2(amount) });
      totalExpenses += amount;
    }
  }
  revenue.sort((x, y) => x.code.localeCompare(y.code));
  expenses.sort((x, y) => x.code.localeCompare(y.code));
  return {
    from: from ?? null,
    to: to ?? null,
    revenue,
    totalRevenue: r2(totalRevenue),
    expenses,
    totalExpenses: r2(totalExpenses),
    netProfit: r2(totalRevenue - totalExpenses),
  };
}

// ── Balance Sheet ───────────────────────────────────────────────────────────
export function buildBalanceSheet(accounts: Account[], journals: Journal[], asOf?: string | null): BalanceSheet {
  const agg = aggregate(journals, null, asOf);
  const assets: StatementLine[] = [];
  const liabilities: StatementLine[] = [];
  const equity: StatementLine[] = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let explicitEquity = 0;
  for (const a of accounts) {
    const t = agg.get(a.id);
    if (!t) continue;
    const amount = signedBalance(a.type, t);
    if (a.type === 'asset' && amount !== 0) {
      assets.push({ accountId: a.id, code: a.code, name: a.name, amount: r2(amount) });
      totalAssets += amount;
    } else if (a.type === 'liability' && amount !== 0) {
      liabilities.push({ accountId: a.id, code: a.code, name: a.name, amount: r2(amount) });
      totalLiabilities += amount;
    } else if (a.type === 'equity' && amount !== 0) {
      equity.push({ accountId: a.id, code: a.code, name: a.name, amount: r2(amount) });
      explicitEquity += amount;
    }
  }
  // Retained earnings closes the P&L into equity as of the statement date.
  const retainedEarnings = netIncome(accounts, journals, null, asOf);
  const totalEquity = explicitEquity + retainedEarnings;
  assets.sort((x, y) => x.code.localeCompare(y.code));
  liabilities.sort((x, y) => x.code.localeCompare(y.code));
  equity.sort((x, y) => x.code.localeCompare(y.code));
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  return {
    asOf: asOf ?? null,
    assets,
    totalAssets: r2(totalAssets),
    liabilities,
    totalLiabilities: r2(totalLiabilities),
    equity,
    retainedEarnings: r2(retainedEarnings),
    totalEquity: r2(totalEquity),
    totalLiabilitiesAndEquity: r2(totalLiabilitiesAndEquity),
    balanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
  };
}

// ── Cash Flow (direct method, cash-account ledger movement) ─────────────────
export function buildCashFlow(
  accounts: Account[],
  journals: Journal[],
  from?: string | null,
  to?: string | null,
): CashFlow {
  const cashIds = new Set(accounts.filter(isCashAccount).map((a) => a.id));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // Opening cash = net cash balance from all journals strictly before `from`.
  let openingCash = 0;
  if (from) {
    for (const j of journals) {
      if (postedDate(j) >= from) continue;
      for (const line of j.lines) {
        if (cashIds.has(line.accountId)) openingCash += line.debit - line.credit;
      }
    }
  }

  let inflows = 0;
  let outflows = 0;
  const counterpart = new Map<string, number>();
  for (const j of journals) {
    if (!inRange(j, from, to)) continue;
    const touchesCash = j.lines.some((l) => cashIds.has(l.accountId));
    if (!touchesCash) continue;
    for (const line of j.lines) {
      if (cashIds.has(line.accountId)) {
        inflows += line.debit;
        outflows += line.credit;
      } else {
        // Cash attributed to this counterpart = mirror of its own posting.
        const v = (counterpart.get(line.accountId) ?? 0) + (line.credit - line.debit);
        counterpart.set(line.accountId, v);
      }
    }
  }

  const byCounterpart: StatementLine[] = [];
  for (const [accountId, amount] of counterpart) {
    if (Math.abs(amount) < 0.005) continue;
    const a = accountById.get(accountId);
    byCounterpart.push({
      accountId,
      code: a?.code ?? '—',
      name: a?.name ?? 'Unknown',
      amount: r2(amount),
    });
  }
  byCounterpart.sort((x, y) => x.code.localeCompare(y.code));

  const netChange = inflows - outflows;
  return {
    from: from ?? null,
    to: to ?? null,
    openingCash: r2(openingCash),
    inflows: r2(inflows),
    outflows: r2(outflows),
    netChange: r2(netChange),
    closingCash: r2(openingCash + netChange),
    cashAccounts: accounts.filter(isCashAccount).map((a) => ({ code: a.code, name: a.name })),
    byCounterpart,
  };
}
