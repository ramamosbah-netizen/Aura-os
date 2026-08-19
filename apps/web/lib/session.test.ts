import { describe, expect, it } from 'vitest';
import { decodeSessionUser } from './session';

function token(payload: Record<string, unknown>): string {
  const part = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `header.${part}.signature`;
}

describe('decodeSessionUser', () => {
  it('returns display claims only for an unexpired session', () => {
    expect(decodeSessionUser(token({ sub: 'u-admin', tenantId: 'dev-tenant', exp: 2000 }), 1000)).toEqual({
      sub: 'u-admin',
      tenantId: 'dev-tenant',
      expiresAt: 2000,
    });
  });

  it('rejects expired, malformed, missing-expiry and not-yet-valid sessions', () => {
    expect(decodeSessionUser(token({ sub: 'u-admin', exp: 1000 }), 1000)).toBeNull();
    expect(decodeSessionUser(token({ sub: 'u-admin' }), 1000)).toBeNull();
    expect(decodeSessionUser(token({ sub: 'u-admin', exp: 2000, nbf: 1100 }), 1000)).toBeNull();
    expect(decodeSessionUser('not-a-token', 1000)).toBeNull();
  });
});
