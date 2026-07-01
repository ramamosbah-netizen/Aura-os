import { describe, it, expect } from 'vitest';
import { type Account, makeAccount } from './account';
import { type Journal, makeJournal } from './journal';
import { buildIncomeStatement } from './statements';

// Two companies under one tenant; consolidation = sum across companies.
const tenantId = 't-grp';
const cash = makeAccount({ tenantId, code: '1000', name: 'Cash', type: 'asset' });
const sales = makeAccount({ tenantId, code: '4000', name: 'Sales', type: 'revenue' });
const accounts = [cash, sales];

function sale(companyId: string, amount: number): Journal {
  const j = makeJournal({
    tenantId,
    companyId,
    description: `sale ${companyId}`,
    lines: [
      { accountId: cash.id, accountCode: '1000', accountName: 'Cash', debit: amount, credit: 0 },
      { accountId: sales.id, accountCode: '4000', accountName: 'Sales', debit: 0, credit: amount },
    ],
  });
  return { ...j, postedAt: '2026-03-01T00:00:00.000Z' };
}

describe('group consolidation (company dimension on the GL)', () => {
  const journals = [sale('co-a', 100_000), sale('co-a', 50_000), sale('co-b', 80_000)];

  it('tags journals with companyId via makeJournal', () => {
    expect(journals[0].companyId).toBe('co-a');
    expect(journals[2].companyId).toBe('co-b');
  });

  it('per-company revenue folds only that company; consolidated is the group sum', () => {
    const coA = buildIncomeStatement(accounts, journals.filter((j) => j.companyId === 'co-a'));
    const coB = buildIncomeStatement(accounts, journals.filter((j) => j.companyId === 'co-b'));
    const group = buildIncomeStatement(accounts, journals);

    expect(coA.totalRevenue).toBe(150_000);
    expect(coB.totalRevenue).toBe(80_000);
    expect(group.totalRevenue).toBe(230_000); // co-a + co-b
    expect(group.totalRevenue).toBe(coA.totalRevenue + coB.totalRevenue);
  });
});
