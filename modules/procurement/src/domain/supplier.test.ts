import { describe, it, expect } from 'vitest';
import { makeSupplier, approveSupplier, suspendSupplier, isApproved } from './supplier';

const base = { tenantId: 't1', code: 'SUP-001', name: 'Steel Ltd' };

describe('makeSupplier', () => {
  it('creates a pending vendor defaulting to materials', () => {
    const s = makeSupplier(base);
    expect(s.status).toBe('pending');
    expect(s.category).toBe('materials');
  });

  it('requires code and name', () => {
    expect(() => makeSupplier({ ...base, code: '' })).toThrow('code is required');
    expect(() => makeSupplier({ ...base, name: ' ' })).toThrow('name is required');
  });

  it('rejects an unknown category', () => {
    expect(() => makeSupplier({ ...base, category: 'banking' as never })).toThrow('category must be one of');
  });

  it('validates a 15-digit TRN', () => {
    expect(() => makeSupplier({ ...base, trn: '123' })).toThrow('TRN must be 15 digits');
    expect(makeSupplier({ ...base, trn: '100123456700003' }).trn).toBe('100123456700003');
  });
});

describe('lifecycle', () => {
  it('approves a pending vendor', () => {
    const s = approveSupplier(makeSupplier(base));
    expect(s.status).toBe('approved');
    expect(isApproved(s)).toBe(true);
  });

  it('suspends an approved vendor then reinstates it', () => {
    let s = approveSupplier(makeSupplier(base));
    s = suspendSupplier(s);
    expect(s.status).toBe('suspended');
    s = approveSupplier(s); // reinstate
    expect(s.status).toBe('approved');
  });

  it('cannot suspend a pending vendor', () => {
    expect(() => suspendSupplier(makeSupplier(base))).toThrow('only an approved supplier can be suspended');
  });

  it('cannot approve an already-approved vendor', () => {
    expect(() => approveSupplier(approveSupplier(makeSupplier(base)))).toThrow('already approved');
  });
});
