import { describe, it, expect } from 'vitest';
import { type Account, makeAccount } from './account';
import { type Journal, makeJournal, buildEliminations, eliminationTotal } from './journal';
import { buildIncomeStatement } from './statements';

const tenantId = 't-grp';
const cash = makeAccount({ tenantId, code: '1000', name: 'Cash', type: 'asset' });
const sales = makeAccount({ tenantId, code: '4000', name: 'Sales', type: 'revenue' });
const accounts = [cash, sales];

function sale(companyId: string, amount: number, counterparty?: string): Journal {
  const j = makeJournal({
    tenantId,
    companyId,
    counterpartyCompanyId: counterparty ?? null,
    description: `sale ${companyId}`,
    lines: [
      { accountId: cash.id, accountCode: '1000', accountName: 'Cash', debit: amount, credit: 0 },
      { accountId: sales.id, accountCode: '4000', accountName: 'Sales', debit: 0, credit: amount },
    ],
  });
  return { ...j, postedAt: '2026-03-01T00:00:00.000Z' };
}

describe('intercompany eliminations', () => {
  // co-a external 100k; co-a→co-b intra-group 30k; co-b external 80k.
  const journals = [sale('co-a', 100_000), sale('co-a', 30_000, 'co-b'), sale('co-b', 80_000)];

  it('naive group sum double-counts intra-group revenue', () => {
    const group = buildIncomeStatement(accounts, journals);
    expect(group.totalRevenue).toBe(210_000); // 100 + 30 + 80 (includes intra-group)
  });

  it('eliminations reverse intercompany journals so the group nets them out', () => {
    const elims = buildEliminations(journals);
    expect(elims.length).toBe(1);
    expect(eliminationTotal(journals)).toBe(30_000);

    const consolidated = buildIncomeStatement(accounts, [...journals, ...elims]);
    expect(consolidated.totalRevenue).toBe(180_000); // 210 − 30 intra-group
  });

  it('no intercompany tags → no eliminations', () => {
    const clean = [sale('co-a', 100_000), sale('co-b', 80_000)];
    expect(buildEliminations(clean).length).toBe(0);
    expect(eliminationTotal(clean)).toBe(0);
  });
});
