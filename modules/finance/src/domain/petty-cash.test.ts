import { describe, it, expect } from 'vitest';
import { makePettyCashFund, applyPettyCashTx, makePettyCashTransaction } from './petty-cash';

const T = 'tenant-1';

describe('PettyCashFund', () => {
  it('creates an active fund with an opening float', () => {
    const f = makePettyCashFund({ tenantId: T, name: 'Site A Float', openingFloat: 5000 });
    expect(f.balance).toBe(5000);
    expect(f.status).toBe('active');
  });

  it('defaults opening float to 0', () => {
    expect(makePettyCashFund({ tenantId: T, name: 'X' }).balance).toBe(0);
  });

  it('rejects a negative opening float', () => {
    expect(() => makePettyCashFund({ tenantId: T, name: 'X', openingFloat: -1 })).toThrow('cannot be negative');
  });

  it('rejects a blank name', () => {
    expect(() => makePettyCashFund({ tenantId: T, name: '  ' })).toThrow('name is required');
  });
});

describe('applyPettyCashTx', () => {
  it('adds on top-up', () => {
    expect(applyPettyCashTx(1000, 'topup', 500)).toBe(1500);
  });

  it('subtracts on expense', () => {
    expect(applyPettyCashTx(1000, 'expense', 300)).toBe(700);
  });

  it('rejects an expense that would overdraw the float', () => {
    expect(() => applyPettyCashTx(200, 'expense', 500)).toThrow('insufficient petty cash');
  });

  it('rejects a non-positive amount', () => {
    expect(() => applyPettyCashTx(1000, 'topup', 0)).toThrow('amount must be positive');
  });
});

describe('makePettyCashTransaction', () => {
  it('records an expense with category + running balance', () => {
    const tx = makePettyCashTransaction({ tenantId: T, fundId: 'f1', type: 'expense', category: 'fuel', amount: 120, description: 'Diesel', transactionDate: '2026-06-20' }, 880);
    expect(tx.type).toBe('expense');
    expect(tx.category).toBe('fuel');
    expect(tx.balanceAfter).toBe(880);
  });

  it('defaults the description by type', () => {
    const tx = makePettyCashTransaction({ tenantId: T, fundId: 'f1', type: 'topup', amount: 1000, transactionDate: '2026-06-20' }, 2000);
    expect(tx.description).toBe('replenishment');
  });

  it('rejects an unknown expense category', () => {
    expect(() => makePettyCashTransaction({ tenantId: T, fundId: 'f1', type: 'expense', category: 'bribes' as never, amount: 1, transactionDate: '2026-06-20' }, 0)).toThrow('category must be one of');
  });

  it('rejects a bad date', () => {
    expect(() => makePettyCashTransaction({ tenantId: T, fundId: 'f1', type: 'topup', amount: 1, transactionDate: '20-06-2026' }, 1)).toThrow('YYYY-MM-DD');
  });
});

// ── Regression: a cash float is counted in fils, not in doubles ──────────────
describe('petty cash arithmetic stays on 2 decimal places', () => {
  it('lets the custodian spend the last of the float', () => {
    // 0.30 in, 0.10 out leaves 0.19999999999999998 in binary — so spending the remaining 0.20 was
    // REFUSED as "insufficient petty cash" on a float that plainly held it.
    let b = applyPettyCashTx(0, 'topup', 0.3);
    b = applyPettyCashTx(b, 'expense', 0.1);
    expect(b).toBe(0.2);
    expect(applyPettyCashTx(b, 'expense', 0.2)).toBe(0);
  });

  it('does not drift over a run of ordinary expenses', () => {
    let b = 1000;
    for (const amt of [12.35, 7.15, 0.1, 0.2, 33.33, 5.55, 0.07]) b = applyPettyCashTx(b, 'expense', amt);
    expect(b).toBe(941.25); // was 941.2499999999999
  });

  it('still refuses a genuine overdraw', () => {
    expect(() => applyPettyCashTx(50, 'expense', 50.01)).toThrow(/insufficient petty cash/);
  });

  it('reports the rounded balance in the overdraw message', () => {
    expect(() => applyPettyCashTx(0.2, 'expense', 5)).toThrow(/balance 0.2, expense 5/);
  });

  it('rounds the amount recorded on the transaction', () => {
    const tx = makePettyCashTransaction(
      { tenantId: 't1', fundId: 'f1', type: 'expense', amount: 10.005, transactionDate: '2026-02-01' },
      100,
    );
    expect(tx.amount).toBe(10.01);
  });
});
