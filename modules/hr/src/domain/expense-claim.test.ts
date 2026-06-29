import { describe, it, expect } from 'vitest';
import { makeExpenseClaim, submitClaim, approveClaim, rejectClaim, reimburseClaim } from './expense-claim';

const base = { tenantId: 't1', employeeId: 'emp-1', category: 'travel' as const, amount: 350, expenseDate: '2026-06-20' };

describe('ExpenseClaim', () => {
  it('creates a draft claim', () => {
    const c = makeExpenseClaim({ ...base, description: 'Taxi to site' });
    expect(c.status).toBe('draft');
    expect(c.amount).toBe(350);
    expect(c.category).toBe('travel');
    expect(c.approvedBy).toBeNull();
  });

  it('rejects non-positive amount', () => {
    expect(() => makeExpenseClaim({ ...base, amount: 0 })).toThrow('amount must be positive');
  });

  it('rejects unknown category', () => {
    expect(() => makeExpenseClaim({ ...base, category: 'bribes' as never })).toThrow('category must be one of');
  });

  it('rejects bad date format', () => {
    expect(() => makeExpenseClaim({ ...base, expenseDate: '20/06/2026' })).toThrow('YYYY-MM-DD');
  });

  it('runs the full happy path: draft → submitted → approved → reimbursed', () => {
    let c = makeExpenseClaim(base);
    c = submitClaim(c);
    expect(c.status).toBe('submitted');
    c = approveClaim(c, 'mgr-9');
    expect(c.status).toBe('approved');
    expect(c.approvedBy).toBe('mgr-9');
    c = reimburseClaim(c, '2026-06-28');
    expect(c.status).toBe('reimbursed');
    expect(c.reimbursedDate).toBe('2026-06-28');
  });

  it('can reject a submitted claim', () => {
    const c = rejectClaim(submitClaim(makeExpenseClaim(base)));
    expect(c.status).toBe('rejected');
  });

  it('cannot approve a draft (must submit first)', () => {
    expect(() => approveClaim(makeExpenseClaim(base), 'mgr-9')).toThrow('cannot approve');
  });

  it('cannot reimburse before approval', () => {
    const c = submitClaim(makeExpenseClaim(base));
    expect(() => reimburseClaim(c)).toThrow('must be approved first');
  });

  it('cannot reject an approved claim', () => {
    const c = approveClaim(submitClaim(makeExpenseClaim(base)), 'mgr-9');
    expect(() => rejectClaim(c)).toThrow('cannot reject');
  });
});
