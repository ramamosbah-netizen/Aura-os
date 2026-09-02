import { describe, expect, it } from 'vitest';
import { dispatchClientShare, makeContractClientShare } from './contract-client-share';

describe('contract client share domain', () => {
  it('starts prepared and records a correlation identity', () => {
    const share = makeContractClientShare({ tenantId:'t1', contractId:'c1', revisionId:'r1', recipient:' client@example.test ', method:'download' });
    expect(share.state).toBe('prepared');
    expect(share.recipient).toBe('client@example.test');
    expect(share.correlationId).toBeTruthy();
  });
  it('requires a recipient and does not claim delivery on dispatch', () => {
    expect(() => makeContractClientShare({ tenantId:'t1', contractId:'c1', revisionId:'r1', recipient:' ', method:'email' })).toThrow(/recipient/);
    const share = makeContractClientShare({ tenantId:'t1', contractId:'c1', revisionId:'r1', recipient:'client@example.test', method:'email' });
    expect(dispatchClientShare(share).state).toBe('dispatched');
  });
});

