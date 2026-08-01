import { describe, it, expect } from 'vitest';
import { makeContractBond, applyBondAction, expiringBonds, type ContractBond } from './contract-bond';

const base = { tenantId: 't', contractId: 'c', kind: 'performance' as const, reference: 'PB-1', amount: 100000 };

describe('contract-bond domain', () => {
  it('creates an active bond and rounds the amount', () => {
    const b = makeContractBond({ ...base, amount: 100000.006 });
    expect(b.status).toBe('active');
    expect(b.amount).toBe(100000.01);
    expect(b.reference).toBe('PB-1');
  });

  it('rejects an invalid kind, empty reference, non-positive amount, bad date', () => {
    expect(() => makeContractBond({ ...base, kind: 'nope' as never })).toThrow(/invalid bond kind/i);
    expect(() => makeContractBond({ ...base, reference: '  ' })).toThrow(/reference is required/i);
    expect(() => makeContractBond({ ...base, amount: 0 })).toThrow(/amount must be positive/i);
    expect(() => makeContractBond({ ...base, expiryDate: '2026/01/01' })).toThrow(/YYYY-MM-DD/);
  });

  it('applyBondAction moves active → released/called/expired, and blocks non-active', () => {
    const b = makeContractBond(base);
    expect(applyBondAction(b, 'release').status).toBe('released');
    expect(applyBondAction(b, 'call').status).toBe('called');
    expect(() => applyBondAction(applyBondAction(b, 'release'), 'call')).toThrow(/cannot call a released bond/i);
  });

  it('expiringBonds returns active bonds expiring within the window', () => {
    const soon = makeContractBond({ ...base, reference: 'A', expiryDate: '2026-01-10' });
    const later = makeContractBond({ ...base, reference: 'B', expiryDate: '2026-06-01' });
    const released = applyBondAction(makeContractBond({ ...base, reference: 'C', expiryDate: '2026-01-05' }), 'release');
    const out = expiringBonds([soon, later, released], 30, '2026-01-01');
    expect(out.map((b) => b.reference)).toEqual(['A']);
  });
});
