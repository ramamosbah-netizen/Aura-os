import { describe, expect, it } from 'vitest';
import { assertContractTransition, CONTRACT_EVENT, makeContract } from './contract';

describe('contracts contract model', () => {
  it('creates a contract with sane defaults and trimmed fields', () => {
    const c = makeContract({ tenantId: 't1', title: '  Tower CCTV Delivery  ', value: 0 });
    expect(c.title).toBe('Tower CCTV Delivery');
    expect(c.status).toBe('draft');
    expect(c.value).toBe(0);
    expect(c.reference).toBeNull();
    expect(c.tenderId).toBeNull();
    expect(c.accountId).toBeNull();
    expect(c.id).toBeTruthy();
    expect(c.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('carries the tender + account references and snapshots down the chain', () => {
    const c = makeContract({
      tenantId: 't1',
      title: 'Mall ELV Delivery',
      reference: 'CTR-2026-001',
      tenderId: 'tnd-9',
      tenderTitle: 'Mall ELV Package',
      accountId: 'acc-9',
      accountName: 'Globex MEP',
      status: 'active',
      value: 1250000,
    });
    expect(c.tenderId).toBe('tnd-9');
    expect(c.tenderTitle).toBe('Mall ELV Package');
    expect(c.accountId).toBe('acc-9');
    expect(c.accountName).toBe('Globex MEP');
    expect(c.reference).toBe('CTR-2026-001');
    expect(c.status).toBe('active');
    expect(c.value).toBe(1250000);
  });

  it('rejects missing/garbage values instead of fabricating zero', () => {
    expect(() => makeContract({ tenantId: 't1', title: 'X' })).toThrow(/finite non-negative/);
    expect(() => makeContract({ tenantId: 't1', title: 'X', value: Number.NaN })).toThrow(/finite non-negative/);
    expect(() => makeContract({ tenantId: 't1', title: 'X', value: -1 })).toThrow(/finite non-negative/);
    expect(makeContract({ tenantId: 't1', title: 'X', value: 0 }).value).toBe(0);
  });

  it('exposes the spine event type', () => {
    expect(CONTRACT_EVENT.created).toBe('contracts.contract.created');
  });

  it('enforces the governed lifecycle and allows same-state replay', () => {
    expect(() => assertContractTransition('draft', 'active')).not.toThrow();
    expect(() => assertContractTransition('active', 'completed')).not.toThrow();
    expect(() => assertContractTransition('draft', 'draft')).not.toThrow();
    expect(() => assertContractTransition('draft', 'completed')).toThrow(/invalid contract transition/);
    expect(() => assertContractTransition('completed', 'active')).toThrow(/invalid contract transition/);
  });
});
