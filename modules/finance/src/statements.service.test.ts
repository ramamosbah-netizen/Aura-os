import { describe, it, expect } from 'vitest';
import { StatementsService } from './statements.service';
import { InMemoryAccountStore } from './in-memory-account-store';
import { InMemoryJournalStore } from './in-memory-journal-store';
import { makeAccount } from './domain/account';
import { makeJournal } from './domain/journal';

// StatementsService produces the three primary statements and the trial balance, and had no test
// of its own. The domain fold beneath it was covered; the service — which decides WHICH journals
// the fold sees — was not, and that is where the company scoping lives.

const T = 't-stmt';

async function harness() {
  const accountStore = new InMemoryAccountStore();
  const journalStore = new InMemoryJournalStore();

  const cash = makeAccount({ tenantId: T, code: '1000', name: 'Cash at Bank', type: 'asset' });
  const revenue = makeAccount({ tenantId: T, code: '4000', name: 'Revenue', type: 'revenue' });
  for (const a of [cash, revenue]) await accountStore.create(a);

  // Two companies in one group, each with its own sale.
  const sale = (companyId: string, amount: number) =>
    makeJournal({
      tenantId: T,
      companyId,
      description: `sale ${companyId}`,
      postedAt: '2026-02-10T00:00:00.000Z',
      lines: [
        { accountId: cash.id, accountCode: cash.code, accountName: cash.name, debit: amount, credit: 0 },
        { accountId: revenue.id, accountCode: revenue.code, accountName: revenue.name, debit: 0, credit: amount },
      ],
    });
  await journalStore.create(sale('co-a', 300_000));
  await journalStore.create(sale('co-b', 700_000));

  return { svc: new StatementsService(accountStore, journalStore) };
}

describe('StatementsService — company scoping', () => {
  it('reports only the acting company on the income statement', async () => {
    // Statements used to be tenant-wide with no company filter, so a user in Company A saw the
    // whole group's revenue — 1,000,000 instead of their own 300,000.
    const { svc } = await harness();
    const is = await svc.incomeStatement(T, null, null, 'co-a');
    expect(is.totalRevenue).toBe(300_000);
  });

  it('keeps the other company out of the balance sheet', async () => {
    const { svc } = await harness();
    const bs = await svc.balanceSheet(T, null, 'co-a');
    expect(bs.totalAssets).toBe(300_000);
    expect(bs.balanced).toBe(true);
  });

  it('scopes the trial balance and keeps it balanced', async () => {
    const { svc } = await harness();
    const tb = await svc.trialBalance(T, null, 'co-b');
    expect(tb.totalDebit).toBe(700_000);
    expect(tb.totalCredit).toBe(700_000);
    expect(tb.balanced).toBe(true);
  });

  it('scopes the cash flow', async () => {
    const { svc } = await harness();
    const cf = await svc.cashFlow(T, null, null, 'co-b');
    expect(cf.inflows).toBe(700_000);
  });

  it('still reports the whole tenant when no company is bound', async () => {
    // A group-level user has no companyId in context and should see everything.
    const { svc } = await harness();
    expect((await svc.incomeStatement(T, null, null, null)).totalRevenue).toBe(1_000_000);
    expect((await svc.balanceSheet(T, null, undefined)).totalAssets).toBe(1_000_000);
  });

  it('returns empty statements for a company with no journals', async () => {
    const { svc } = await harness();
    const is = await svc.incomeStatement(T, null, null, 'co-zzz');
    expect(is.totalRevenue).toBe(0);
    expect(is.netProfit).toBe(0);
  });
});
