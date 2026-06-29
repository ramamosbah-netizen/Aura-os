import { describe, it, expect } from 'vitest';
import { makeBankGuarantee, releaseGuarantee, claimGuarantee, expireGuarantee, daysToExpiry, isExpiringSoon } from './bank-guarantee';

const base = {
  tenantId: 't1',
  reference: 'PB-2026-001',
  type: 'performance' as const,
  beneficiary: 'Emaar Properties',
  bankName: 'Emirates NBD',
  amount: 500000,
  issueDate: '2026-01-01',
  expiryDate: '2026-12-31',
};

describe('makeBankGuarantee', () => {
  it('creates an active guarantee defaulting to AED', () => {
    const g = makeBankGuarantee(base);
    expect(g.status).toBe('active');
    expect(g.currency).toBe('AED');
    expect(g.amount).toBe(500000);
  });

  it('rejects an unknown type', () => {
    expect(() => makeBankGuarantee({ ...base, type: 'mortgage' as never })).toThrow('type must be one of');
  });

  it('rejects a non-positive amount', () => {
    expect(() => makeBankGuarantee({ ...base, amount: 0 })).toThrow('amount must be positive');
  });

  it('rejects expiry before issue', () => {
    expect(() => makeBankGuarantee({ ...base, issueDate: '2026-06-01', expiryDate: '2026-05-01' })).toThrow('expiryDate cannot be before issueDate');
  });
});

describe('lifecycle', () => {
  it('releases an active guarantee', () => {
    expect(releaseGuarantee(makeBankGuarantee(base)).status).toBe('released');
  });

  it('claims an active guarantee', () => {
    expect(claimGuarantee(makeBankGuarantee(base)).status).toBe('claimed');
  });

  it('cannot release an already-released guarantee', () => {
    const g = releaseGuarantee(makeBankGuarantee(base));
    expect(() => claimGuarantee(g)).toThrow('cannot claimed a guarantee in status released');
  });

  it('can expire an active guarantee', () => {
    expect(expireGuarantee(makeBankGuarantee(base)).status).toBe('expired');
  });
});

describe('expiry helpers', () => {
  it('counts whole days to expiry', () => {
    expect(daysToExpiry(makeBankGuarantee(base), '2026-12-01')).toBe(30);
  });

  it('is negative once past expiry', () => {
    expect(daysToExpiry(makeBankGuarantee(base), '2027-01-10')).toBe(-10);
  });

  it('flags guarantees expiring within the window', () => {
    const g = makeBankGuarantee(base);
    expect(isExpiringSoon(g, '2026-12-15', 30)).toBe(true);
    expect(isExpiringSoon(g, '2026-06-01', 30)).toBe(false);
  });

  it('never flags a non-active guarantee', () => {
    const g = releaseGuarantee(makeBankGuarantee(base));
    expect(isExpiringSoon(g, '2026-12-15', 30)).toBe(false);
  });
});
