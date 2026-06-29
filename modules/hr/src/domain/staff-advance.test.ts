import { describe, it, expect } from 'vitest';
import { makeStaffAdvance, approveAdvance, rejectAdvance, disburseAdvance, recordRepayment, balanceOf, installmentAmount } from './staff-advance';

const base = { tenantId: 't1', employeeId: 'emp-1', amount: 6000, installments: 6, requestDate: '2026-06-20' };

describe('makeStaffAdvance', () => {
  it('creates a requested advance', () => {
    const a = makeStaffAdvance(base);
    expect(a.status).toBe('requested');
    expect(a.amountRepaid).toBe(0);
    expect(installmentAmount(a)).toBe(1000);
  });

  it('rejects non-positive amount', () => {
    expect(() => makeStaffAdvance({ ...base, amount: 0 })).toThrow('amount must be positive');
  });

  it('rejects out-of-range installments', () => {
    expect(() => makeStaffAdvance({ ...base, installments: 0 })).toThrow('between 1 and 60');
    expect(() => makeStaffAdvance({ ...base, installments: 61 })).toThrow('between 1 and 60');
  });

  it('rejects a bad request date', () => {
    expect(() => makeStaffAdvance({ ...base, requestDate: '20/06/2026' })).toThrow('YYYY-MM-DD');
  });
});

describe('lifecycle', () => {
  it('runs requested → approved → disbursed → settled', () => {
    let a = approveAdvance(makeStaffAdvance(base), 'mgr-9');
    expect(a.status).toBe('approved');
    expect(a.approvedBy).toBe('mgr-9');
    a = disburseAdvance(a, '2026-06-25');
    expect(a.status).toBe('disbursed');
    a = recordRepayment(a, 3000);
    expect(a.status).toBe('disbursed');
    expect(balanceOf(a)).toBe(3000);
    a = recordRepayment(a, 3000);
    expect(a.status).toBe('settled');
    expect(balanceOf(a)).toBe(0);
  });

  it('can reject a requested advance', () => {
    expect(rejectAdvance(makeStaffAdvance(base)).status).toBe('rejected');
  });

  it('cannot disburse before approval', () => {
    expect(() => disburseAdvance(makeStaffAdvance(base))).toThrow('must be approved first');
  });

  it('cannot repay before disbursement', () => {
    const a = approveAdvance(makeStaffAdvance(base), 'mgr-9');
    expect(() => recordRepayment(a, 100)).toThrow('must be disbursed first');
  });

  it('rejects an over-repayment', () => {
    const a = disburseAdvance(approveAdvance(makeStaffAdvance(base), 'mgr-9'));
    expect(() => recordRepayment(a, 99999)).toThrow('exceeds outstanding balance');
  });

  it('cannot approve an already-approved advance', () => {
    const a = approveAdvance(makeStaffAdvance(base), 'mgr-9');
    expect(() => approveAdvance(a, 'mgr-9')).toThrow('cannot approve');
  });
});
