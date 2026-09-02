import { describe, expect, it } from 'vitest';
import { makeContractNegotiationItem, resolveNegotiationItem } from './contract-negotiation';

const base = { tenantId: 't1', contractId: 'c1', revisionId: 'r1', type: 'comment' as const, content: 'Please clarify warranty.' };

describe('contract negotiation domain', () => {
  it('creates an explicit visibility and open status', () => {
    const item = makeContractNegotiationItem({ ...base, visibility: 'client_visible' });
    expect(item.visibility).toBe('client_visible');
    expect(item.status).toBe('open');
  });
  it('requires content and immutable resolution transition', () => {
    expect(() => makeContractNegotiationItem({ ...base, content: ' ' })).toThrow(/content is required/);
    const item = makeContractNegotiationItem(base);
    const resolved = resolveNegotiationItem(item, 'resolved', 'Accepted in R2');
    expect(resolved.status).toBe('resolved');
    expect(() => resolveNegotiationItem(resolved, 'rejected', 'Changed')).toThrow(/already closed/);
  });
});

