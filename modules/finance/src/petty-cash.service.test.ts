import { describe, it, expect, vi } from 'vitest';
import type { EventStore } from '@aura/core';
import { PettyCashService } from './petty-cash.service';
import { InMemoryPettyCashStore } from './in-memory-petty-cash-store';

// Service-level coverage for petty cash: the imprest float and its movements. The domain arithmetic
// (fils rounding, overdraw) is tested in domain/petty-cash.test.ts; here we exercise the service's
// orchestration — balance updates, the closed-fund guard, and transaction retrieval.

const events = () => ({ append: vi.fn().mockResolvedValue(undefined) }) as unknown as EventStore;
const T = 't-pc';
const DAY = '2026-03-01';

function harness() {
  const store = new InMemoryPettyCashStore();
  const svc = new PettyCashService(store, events());
  return { store, svc };
}

describe('PettyCashService', () => {
  it('creates a fund with its opening float, active', async () => {
    const { svc } = harness();
    const fund = await svc.createFund({ tenantId: T, name: 'Site A float', openingFloat: 1_000 });
    expect(fund.balance).toBe(1_000);
    expect(fund.status).toBe('active');
  });

  it('a top-up raises the balance and an expense lowers it', async () => {
    const { svc } = harness();
    const fund = await svc.createFund({ tenantId: T, name: 'Site A float', openingFloat: 1_000 });
    const afterTopup = await svc.recordTransaction(fund.id, 'topup', 500, DAY);
    expect(afterTopup.fund.balance).toBe(1_500);
    const afterExpense = await svc.recordTransaction(fund.id, 'expense', 300, DAY, 'fuel');
    expect(afterExpense.fund.balance).toBe(1_200);
    expect(afterExpense.transaction.balanceAfter).toBe(1_200);
  });

  it('refuses an expense that would overdraw the float', async () => {
    const { svc } = harness();
    const fund = await svc.createFund({ tenantId: T, name: 'Small float', openingFloat: 100 });
    await expect(svc.recordTransaction(fund.id, 'expense', 500, DAY, 'office')).rejects.toThrow(/insufficient petty cash/i);
    expect((await svc.getFund(fund.id))?.balance).toBe(100); // untouched
  });

  it('allows spending the float down to exactly zero', async () => {
    const { svc } = harness();
    const fund = await svc.createFund({ tenantId: T, name: 'Float', openingFloat: 100 });
    const res = await svc.recordTransaction(fund.id, 'expense', 100, DAY, 'office');
    expect(res.fund.balance).toBe(0);
  });

  it('rejects a non-positive amount', async () => {
    const { svc } = harness();
    const fund = await svc.createFund({ tenantId: T, name: 'Float', openingFloat: 100 });
    await expect(svc.recordTransaction(fund.id, 'expense', 0, DAY, 'office')).rejects.toThrow(/amount must be positive/i);
  });

  it('cannot transact on a closed fund', async () => {
    const { store, svc } = harness();
    const fund = await svc.createFund({ tenantId: T, name: 'Float', openingFloat: 100 });
    await store.updateFund({ ...fund, status: 'closed' });
    await expect(svc.recordTransaction(fund.id, 'topup', 50, DAY)).rejects.toThrow(/closed fund/i);
  });

  it('returns a fund with its transaction history', async () => {
    const { svc } = harness();
    const fund = await svc.createFund({ tenantId: T, name: 'Float', openingFloat: 1_000 });
    await svc.recordTransaction(fund.id, 'expense', 200, DAY, 'travel');
    await svc.recordTransaction(fund.id, 'topup', 500, DAY);
    const view = await svc.getFundWithTransactions(fund.id);
    expect(view?.fund.balance).toBe(1_300);
    expect(view?.transactions).toHaveLength(2);
  });
});
