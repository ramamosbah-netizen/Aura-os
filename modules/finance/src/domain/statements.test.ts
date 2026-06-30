import { describe, it, expect } from 'vitest';
import { type Account, makeAccount } from './account';
import { type Journal, makeJournal } from './journal';
import {
  buildBalanceSheet,
  buildCashFlow,
  buildIncomeStatement,
  buildTrialBalance,
} from './statements';

// A minimal but complete double-entry scenario, verified by hand:
//   J1 2026-01-05  Owner invests       Dr Cash 100000 / Cr Share Capital 100000
//   J2 2026-02-10  Credit sale         Dr AR 50000    / Cr Sales Revenue 50000
//   J3 2026-02-15  Collect receivable  Dr Cash 30000  / Cr AR 30000
//   J4 2026-03-01  Pay rent            Dr Rent 8000   / Cr Cash 8000
const tenantId = 't-fin';

const acc = (code: string, name: string, type: Account['type']) =>
  makeAccount({ tenantId, code, name, type });

const cash = acc('1000', 'Cash at Bank', 'asset');
const ar = acc('1100', 'Accounts Receivable', 'asset');
const ap = acc('2000', 'Accounts Payable', 'liability');
const capital = acc('3000', 'Share Capital', 'equity');
const sales = acc('4000', 'Sales Revenue', 'revenue');
const rent = acc('5000', 'Rent Expense', 'expense');
const accounts = [cash, ar, ap, capital, sales, rent];

function journal(date: string, lines: Array<{ a: Account; debit?: number; credit?: number }>): Journal {
  const j = makeJournal({
    tenantId,
    description: `test ${date}`,
    lines: lines.map((l) => ({
      accountId: l.a.id,
      accountCode: l.a.code,
      accountName: l.a.name,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
    })),
  });
  return { ...j, postedAt: `${date}T00:00:00.000Z` };
}

const journals: Journal[] = [
  journal('2026-01-05', [{ a: cash, debit: 100000 }, { a: capital, credit: 100000 }]),
  journal('2026-02-10', [{ a: ar, debit: 50000 }, { a: sales, credit: 50000 }]),
  journal('2026-02-15', [{ a: cash, debit: 30000 }, { a: ar, credit: 30000 }]),
  journal('2026-03-01', [{ a: rent, debit: 8000 }, { a: cash, credit: 8000 }]),
];

describe('financial statements (GL-derived)', () => {
  it('trial balance ties out (total debits = total credits)', () => {
    const tb = buildTrialBalance(accounts, journals, '2026-03-31');
    expect(tb.totalDebit).toBe(188000);
    expect(tb.totalCredit).toBe(188000);
    expect(tb.balanced).toBe(true);
    // AP has no activity → excluded; the other 5 accounts appear.
    expect(tb.rows.map((r) => r.code)).toEqual(['1000', '1100', '3000', '4000', '5000']);
  });

  it('income statement nets revenue against expense for a period', () => {
    const is = buildIncomeStatement(accounts, journals); // full range
    expect(is.totalRevenue).toBe(50000);
    expect(is.totalExpenses).toBe(8000);
    expect(is.netProfit).toBe(42000);

    // February only: the sale lands, rent (March) does not.
    const feb = buildIncomeStatement(accounts, journals, '2026-02-01', '2026-02-28');
    expect(feb.totalRevenue).toBe(50000);
    expect(feb.totalExpenses).toBe(0);
    expect(feb.netProfit).toBe(50000);
  });

  it('balance sheet balances: assets = liabilities + equity + retained earnings', () => {
    const bs = buildBalanceSheet(accounts, journals, '2026-03-31');
    expect(bs.totalAssets).toBe(142000); // cash 122000 + AR 20000
    expect(bs.totalLiabilities).toBe(0);
    expect(bs.retainedEarnings).toBe(42000); // = net profit to date
    expect(bs.totalEquity).toBe(142000); // capital 100000 + retained 42000
    expect(bs.totalLiabilitiesAndEquity).toBe(142000);
    expect(bs.balanced).toBe(true);
  });

  it('balance sheet is as-of-date aware', () => {
    const bs = buildBalanceSheet(accounts, journals, '2026-02-28'); // before rent
    expect(bs.totalAssets).toBe(150000); // cash 130000 + AR 20000
    expect(bs.retainedEarnings).toBe(50000); // only the sale
    expect(bs.balanced).toBe(true);
  });

  it('cash flow reconciles to the cash account movement', () => {
    const cf = buildCashFlow(accounts, journals); // full range
    expect(cf.cashAccounts).toEqual([{ code: '1000', name: 'Cash at Bank' }]);
    expect(cf.openingCash).toBe(0);
    expect(cf.inflows).toBe(130000); // 100000 capital + 30000 collection
    expect(cf.outflows).toBe(8000); // rent
    expect(cf.netChange).toBe(122000);
    expect(cf.closingCash).toBe(122000); // == cash balance on the trial balance

    // Cash attributed to counterparts sums to the net change.
    const sum = cf.byCounterpart.reduce((s, l) => s + l.amount, 0);
    expect(sum).toBe(122000);
    const byCode = Object.fromEntries(cf.byCounterpart.map((l) => [l.code, l.amount]));
    expect(byCode['3000']).toBe(100000); // capital in
    expect(byCode['1100']).toBe(30000); // AR collected
    expect(byCode['5000']).toBe(-8000); // rent out
  });

  it('cash flow respects an opening balance for a mid-stream period', () => {
    const cf = buildCashFlow(accounts, journals, '2026-02-01', '2026-03-31');
    expect(cf.openingCash).toBe(100000); // the January capital injection
    expect(cf.inflows).toBe(30000);
    expect(cf.outflows).toBe(8000);
    expect(cf.netChange).toBe(22000);
    expect(cf.closingCash).toBe(122000);
  });
});
