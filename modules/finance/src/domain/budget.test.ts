import { describe, it, expect } from 'vitest';
import { type Account, makeAccount } from './account';
import { type Journal, makeJournal } from './journal';
import { buildBudgetVsActual, makeBudget } from './budget';

const tenantId = 't-bud';
const rent = makeAccount({ tenantId, code: '5000', name: 'Rent Expense', type: 'expense' });
const salaries = makeAccount({ tenantId, code: '5100', name: 'Salaries', type: 'expense' });
const cash = makeAccount({ tenantId, code: '1000', name: 'Cash', type: 'asset' });
const accounts = [rent, salaries, cash];

function journal(date: string, lines: Array<{ a: Account; debit?: number; credit?: number }>): Journal {
  const j = makeJournal({
    tenantId,
    description: date,
    lines: lines.map((l) => ({ accountId: l.a.id, accountCode: l.a.code, accountName: l.a.name, debit: l.debit ?? 0, credit: l.credit ?? 0 })),
  });
  return { ...j, postedAt: `${date}T00:00:00.000Z` };
}

// Q1 actuals: rent 8000 (Jan) + 8000 (Feb) = 16000; salaries 50000 (Feb).
const journals: Journal[] = [
  journal('2026-01-10', [{ a: rent, debit: 8000 }, { a: cash, credit: 8000 }]),
  journal('2026-02-10', [{ a: rent, debit: 8000 }, { a: cash, credit: 8000 }]),
  journal('2026-02-25', [{ a: salaries, debit: 50000 }, { a: cash, credit: 50000 }]),
  journal('2026-04-10', [{ a: rent, debit: 8000 }, { a: cash, credit: 8000 }]), // outside Q1
];

describe('budget vs actual (GL-folded)', () => {
  it('validates inputs', () => {
    expect(() => makeBudget({ tenantId, name: '', from: '2026-01-01', to: '2026-03-31', lines: [] })).toThrow();
    expect(() => makeBudget({ tenantId, name: 'Q1', from: '2026-03-31', to: '2026-01-01', lines: [{ accountId: rent.id, accountCode: '5000', accountName: 'Rent', amount: 1 }] })).toThrow(/must not precede/);
  });

  it('folds actuals from the GL over the budget date range and computes variance', () => {
    const budget = makeBudget({
      tenantId,
      name: 'Q1 OpEx',
      from: '2026-01-01',
      to: '2026-03-31',
      lines: [
        { accountId: rent.id, accountCode: '5000', accountName: 'Rent Expense', amount: 20000 },
        { accountId: salaries.id, accountCode: '5100', accountName: 'Salaries', amount: 45000 },
      ],
    });

    const bva = buildBudgetVsActual(budget, accounts, journals);

    const byCode = Object.fromEntries(bva.rows.map((r) => [r.code, r]));
    // Rent: budget 20000 vs actual 16000 (April excluded) → under by 4000.
    expect(byCode['5000'].actual).toBe(16000);
    expect(byCode['5000'].variance).toBe(4000);
    expect(byCode['5000'].variancePct).toBe(20);
    // Salaries: budget 45000 vs actual 50000 → over by 5000.
    expect(byCode['5100'].actual).toBe(50000);
    expect(byCode['5100'].variance).toBe(-5000);

    expect(bva.totalBudget).toBe(65000);
    expect(bva.totalActual).toBe(66000);
    expect(bva.totalVariance).toBe(-1000);
  });
});

// ── Regression: unbudgeted spend ─────────────────────────────────────────────
// The fold used to iterate the budget's own lines only, so money spent on an account nobody
// planned for never appeared — a budget-control report blind to exactly the overspend it exists
// to catch. Here the budget plans rent only, while 50,000 of salaries also hits the ledger.
describe('budget-vs-actual surfaces spend that was never budgeted', () => {
  const rentOnly = () =>
    makeBudget({
      tenantId, name: 'Q1 rent only', from: '2026-01-01', to: '2026-03-31',
      lines: [{ accountId: rent.id, accountCode: rent.code, accountName: rent.name, amount: 20_000 }],
    });
  const bva = () => buildBudgetVsActual(rentOnly(), accounts, journals);

  it('reports the unbudgeted account as its own row', () => {
    const row = bva().rows.find((r) => r.code === salaries.code);
    expect(row).toBeDefined();
    expect(row!.unbudgeted).toBe(true);
    expect(row!.budget).toBe(0);
    expect(row!.actual).toBe(50_000);
    expect(row!.variancePct).toBeNull(); // no budget to be a percentage of
  });

  it('counts it in the actual, so the total is no longer flattering', () => {
    const r = bva();
    expect(r.totalActual).toBe(66_000);    // 16,000 rent + 50,000 salaries — was 16,000
    expect(r.totalVariance).toBe(-46_000); // was +4,000 "under budget"
    expect(r.totalUnbudgeted).toBe(50_000);
  });

  it('leaves the budgeted row alone', () => {
    const row = bva().rows.find((r) => r.code === rent.code)!;
    expect(row.unbudgeted).toBe(false);
    expect(row.budget).toBe(20_000);
    expect(row.actual).toBe(16_000); // Q1 only — the April entry stays out
    expect(row.variance).toBe(4_000);
  });

  it('does not sweep in balance-sheet movement — a budget plans performance, not position', () => {
    // Cash moved on every journal above and must not appear as unbudgeted spend.
    expect(bva().rows.some((r) => r.code === cash.code)).toBe(false);
  });

  it('reports nothing unbudgeted when every moving account is planned', () => {
    const full = makeBudget({
      tenantId, name: 'Q1 full', from: '2026-01-01', to: '2026-03-31',
      lines: [
        { accountId: rent.id, accountCode: rent.code, accountName: rent.name, amount: 20_000 },
        { accountId: salaries.id, accountCode: salaries.code, accountName: salaries.name, amount: 60_000 },
      ],
    });
    expect(buildBudgetVsActual(full, accounts, journals).totalUnbudgeted).toBe(0);
  });
});
