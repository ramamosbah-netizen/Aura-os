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

describe('AuthService — refresh & revoke', () => {
  it('mints a token that authenticates into a request context', async () => {
    const token = auth.mint({ sub: 'u-admin', tenantId: 'dev-tenant', companyId: null });
    expect(await auth.contextFromHeader(`Bearer ${token}`)).toMatchObject({ actorId: 'u-admin', tenantId: 'dev-tenant' });
  });

  it('refreshes a valid token into a distinct fresh one', () => {
    const token = auth.mint({ sub: 'u-admin', tenantId: 'dev-tenant', companyId: null });
    const fresh = auth.refresh(`Bearer ${token}`);
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(token);
  });

  it('revokes a token so it can no longer authenticate or refresh', async () => {
    const token = auth.mint({ sub: 'u-admin', tenantId: 'dev-tenant', companyId: null });
    expect(auth.revoke(`Bearer ${token}`)).toBe(true);
    expect(await auth.contextFromHeader(`Bearer ${token}`)).toBeNull();
    expect(auth.refresh(`Bearer ${token}`)).toBeNull();
  });

  it('is a no-op without a bearer token', () => {
    expect(auth.refresh(undefined)).toBeNull();
    expect(auth.revoke(undefined)).toBe(false);
    expect(auth.revoke('Basic xyz')).toBe(false);
  });
});
