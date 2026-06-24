import { describe, expect, it } from 'vitest';
import { signJwt, verifyJwt } from './jwt';

const SECRET = 'test-secret-please-change';

describe('hs256 jwt', () => {
  it('signs and verifies a round-trip, returning the claims', () => {
    const token = signJwt({ sub: 'u-1', tenantId: 't-1', companyId: 'c-1' }, SECRET);
    const claims = verifyJwt(token, SECRET);
    expect(claims?.sub).toBe('u-1');
    expect(claims?.tenantId).toBe('t-1');
    expect(claims?.companyId).toBe('c-1');
    expect(typeof claims?.exp).toBe('number');
  });

  it('rejects a token signed with a different secret', () => {
    const token = signJwt({ sub: 'u-1', tenantId: 't-1' }, SECRET);
    expect(verifyJwt(token, 'wrong-secret')).toBeNull();
  });

  it('rejects a tampered payload (signature no longer matches)', () => {
    const token = signJwt({ sub: 'u-1', tenantId: 't-1' }, SECRET);
    const [h, , s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'u-evil', tenantId: 't-1' }), 'utf8').toString('base64url');
    expect(verifyJwt(`${h}.${forged}.${s}`, SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signJwt({ sub: 'u-1', tenantId: 't-1' }, SECRET, -10);
    expect(verifyJwt(token, SECRET)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifyJwt('not-a-jwt', SECRET)).toBeNull();
    expect(verifyJwt('a.b', SECRET)).toBeNull();
  });
});
