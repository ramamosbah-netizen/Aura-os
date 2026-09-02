import { describe, expect, it } from 'vitest';
import { assertAmendmentTransition, makeContractAmendment } from './contract-amendment';

describe('contract amendment domain', () => {
  it('requires meaningful frozen amendment content', () => {
    const a = makeContractAmendment({ tenantId:'t1', contractId:'c1', baseRevisionId:'r1', title:'Price addendum', content:'Approved price adjustment' });
    expect(a.status).toBe('draft');
    expect(a.sourceVariationId).toBeNull();
  });
  it('allows only governed amendment transitions', () => {
    expect(() => makeContractAmendment({ tenantId:'t1', contractId:'c1', baseRevisionId:'r1', title:' ', content:'x' })).toThrow(/title/);
    expect(() => assertAmendmentTransition('draft', 'signed')).toThrow(/invalid amendment/);
    expect(() => assertAmendmentTransition('approved', 'signed')).not.toThrow();
  });
});

