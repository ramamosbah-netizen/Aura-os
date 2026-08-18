import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from './auth.service';
import { TokenRevocationStore } from './token-revocation';

const SECRET = 'unit-secret-please-change';
let store: TokenRevocationStore;
let auth: AuthService;

beforeEach(() => {
  process.env.AUTH_JWT_SECRET = SECRET;
  delete process.env.AUTH_JWKS_URL;
  delete process.env.SUPABASE_JWKS_URL;
  store = new TokenRevocationStore();
  auth = new AuthService(store);
});
afterEach(() => {
  delete process.env.AUTH_JWT_SECRET;
});

describe('AuthService — mint & revoke', () => {
  it('mints a token that authenticates into a request context', async () => {
    const token = auth.mint({ sub: 'u-admin', tenantId: 'dev-tenant', companyId: null });
    expect(await auth.contextFromHeader(`Bearer ${token}`)).toMatchObject({ actorId: 'u-admin', tenantId: 'dev-tenant' });
  });

  it('mints a self-issued token with NO jti (final shape is {sub, tenantId, sid?, iat, exp})', () => {
    const token = auth.mint({ sub: 'u-admin', tenantId: 'dev-tenant', companyId: null });
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    expect(claims.jti).toBeUndefined();
    // Self-issued tokens carry no jti now, so the jti denylist is a no-op for them.
    expect(auth.revoke(`Bearer ${token}`)).toBe(false);
  });

  it('revokes an IdP-style token that DOES carry a jti so it can no longer authenticate', async () => {
    const token = auth.mint({ sub: 'u-admin', tenantId: 'dev-tenant', companyId: null, jti: 'idp-jti-1' });
    expect(auth.revoke(`Bearer ${token}`)).toBe(true);
    expect(await auth.contextFromHeader(`Bearer ${token}`)).toBeNull();
  });

  it('revoke is a no-op without a bearer token', () => {
    expect(auth.revoke(undefined)).toBe(false);
    expect(auth.revoke('Basic xyz')).toBe(false);
  });
});
