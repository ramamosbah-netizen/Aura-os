import { describe, it, expect } from 'vitest';
import { TokenRevocationStore } from './token-revocation';

describe('TokenRevocationStore', () => {
  it('marks a jti revoked until its expiry', () => {
    const store = new TokenRevocationStore();
    const now = 1000;
    store.revoke('jti-1', 2000);
    expect(store.isRevoked('jti-1', now)).toBe(true);
    expect(store.isRevoked('jti-2', now)).toBe(false);
    expect(store.isRevoked(undefined, now)).toBe(false);
  });

  it('forgets a revoked jti once its token would have expired (self-cleaning)', () => {
    const store = new TokenRevocationStore();
    store.revoke('jti-1', 2000);
    expect(store.isRevoked('jti-1', 2001)).toBe(false);
    expect(store.size()).toBe(0); // swept
  });

  it('ignores an empty jti on revoke', () => {
    const store = new TokenRevocationStore();
    store.revoke('', 2000);
    expect(store.size()).toBe(0);
  });
});
