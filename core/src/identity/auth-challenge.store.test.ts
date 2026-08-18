import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthChallengeStore } from './auth-challenge.store';

// These cover the in-memory implementation — the DB path's atomicity is proven against a real
// PostgreSQL engine in CI (a single-connection WASM engine cannot model two racing transactions).
// The invariants asserted here are the ones the store guarantees regardless of backing: tenant
// scoping, the kind gate, single-use consume, lazy expiry, and the fail-closed production guard.

const TENANT = 't-1';
const OTHER = 't-2';

function issueInput(overrides: Partial<{ kind: 'mfa' | 'password_change'; tenantId: string; userId: string }> = {}) {
  return {
    kind: 'mfa' as const,
    tenantId: TENANT,
    userId: 'u-1',
    credentialId: '00000000-0000-4000-8000-000000000001',
    mustChangePassword: false,
    ...overrides,
  };
}

describe('AuthChallengeStore (in-memory)', () => {
  let store: AuthChallengeStore;

  beforeEach(() => {
    store = new AuthChallengeStore(null);
  });

  it('issues a challenge that is then retrievable in its own tenant and kind', async () => {
    const c = await store.issue(issueInput());
    const got = await store.get(TENANT, c.id, 'mfa');
    expect(got?.id).toBe(c.id);
    expect(got?.userId).toBe('u-1');
  });

  it('is tenant-scoped: another tenant cannot see or consume the challenge', async () => {
    const c = await store.issue(issueInput());
    expect(await store.get(OTHER, c.id, 'mfa')).toBeNull();
    expect(await store.consume(OTHER, c.id, 'mfa')).toBe(false);
    // Still live in its own tenant — the wrong-tenant consume did not claim it.
    expect(await store.get(TENANT, c.id, 'mfa')).not.toBeNull();
  });

  it('enforces the kind gate: a password_change lookup/consume never matches an mfa challenge', async () => {
    const c = await store.issue(issueInput({ kind: 'mfa' }));
    expect(await store.get(TENANT, c.id, 'password_change')).toBeNull();
    expect(await store.consume(TENANT, c.id, 'password_change')).toBe(false);
    // The mfa challenge is untouched.
    expect(await store.consume(TENANT, c.id, 'mfa')).toBe(true);
  });

  it('is single-use: a second consume of the same id returns false', async () => {
    const c = await store.issue(issueInput());
    expect(await store.consume(TENANT, c.id, 'mfa')).toBe(true);
    expect(await store.consume(TENANT, c.id, 'mfa')).toBe(false);
    expect(await store.get(TENANT, c.id, 'mfa')).toBeNull();
  });

  it('grants exactly one winner when two consumes race the same challenge', async () => {
    const c = await store.issue(issueInput());
    const results = await Promise.all([
      store.consume(TENANT, c.id, 'mfa'),
      store.consume(TENANT, c.id, 'mfa'),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('destroys the challenge once attempts are exhausted', async () => {
    const c = await store.issue(issueInput());
    // 5 attempts is the cap; the 5th destroys it.
    for (let i = 0; i < 4; i++) expect(await store.recordAttempt(TENANT, c.id)).toBe(true);
    expect(await store.recordAttempt(TENANT, c.id)).toBe(false);
    expect(await store.get(TENANT, c.id, 'mfa')).toBeNull();
    expect(await store.consume(TENANT, c.id, 'mfa')).toBe(false);
  });

  it('treats an expired challenge as gone for get and consume (lazy expiry)', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const c = await store.issue(issueInput());
      vi.setSystemTime(new Date('2026-01-01T00:06:00Z')); // +6 min, past the 5-min TTL
      expect(await store.get(TENANT, c.id, 'mfa')).toBeNull();
      expect(await store.consume(TENANT, c.id, 'mfa')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AuthChallengeStore persistence guard', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
    delete process.env.AUTH_STATE_PERSISTENCE;
  });

  it('refuses to construct without a pool in production (no silent in-memory fallback)', () => {
    process.env.NODE_ENV = 'production';
    expect(() => new AuthChallengeStore(null)).toThrow(/requires a database/i);
  });

  it('AUTH_STATE_PERSISTENCE=required fails closed even outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTH_STATE_PERSISTENCE = 'required';
    expect(() => new AuthChallengeStore(null)).toThrow(/requires a database/i);
  });

  it('production is NON-DOWNGRADABLE: AUTH_STATE_PERSISTENCE=memory is still refused', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_STATE_PERSISTENCE = 'memory';
    expect(() => new AuthChallengeStore(null)).toThrow(/requires a database/i);
  });
});
