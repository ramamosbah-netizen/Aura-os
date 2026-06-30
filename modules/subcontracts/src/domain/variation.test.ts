import { describe, it, expect } from 'vitest';
import { makeSubcontractVariation, signedAmount, approveVariation, rejectVariation } from './variation';

const base = { tenantId: 't1', subcontractId: 'sc1', reference: 'SCVO-001', type: 'addition' as const, amount: 50000 };

describe('makeSubcontractVariation', () => {
  it('creates a pending variation', () => {
    const v = makeSubcontractVariation({ ...base, description: 'Extra cabling' });
    expect(v.status).toBe('pending');
    expect(v.amount).toBe(50000);
    expect(v.type).toBe('addition');
  });

  it('rejects a non-positive amount', () => {
    expect(() => makeSubcontractVariation({ ...base, amount: 0 })).toThrow('amount must be positive');
  });

  it('rejects an unknown type', () => {
    expect(() => makeSubcontractVariation({ ...base, type: 'change' as never })).toThrow("type must be 'addition' or 'omission'");
  });

  it('requires a reference', () => {
    expect(() => makeSubcontractVariation({ ...base, reference: '' })).toThrow('reference is required');
  });
});

describe('signedAmount', () => {
  it('is positive for additions, negative for omissions', () => {
    expect(signedAmount(makeSubcontractVariation(base))).toBe(50000);
    expect(signedAmount(makeSubcontractVariation({ ...base, type: 'omission', amount: 8000 }))).toBe(-8000);
  });
});

describe('lifecycle', () => {
  it('approves a pending variation', () => {
    const v = approveVariation(makeSubcontractVariation(base), 'mgr-1');
    expect(v.status).toBe('approved');
    expect(v.approvedBy).toBe('mgr-1');
  });

  it('rejects a pending variation', () => {
    expect(rejectVariation(makeSubcontractVariation(base)).status).toBe('rejected');
  });

  it('cannot approve an already-approved variation', () => {
    const v = approveVariation(makeSubcontractVariation(base), 'mgr-1');
    expect(() => approveVariation(v, 'mgr-1')).toThrow('cannot approve');
  });
});
