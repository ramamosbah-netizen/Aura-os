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
