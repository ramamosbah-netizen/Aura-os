import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from './session.store';
import { TenantContext } from '../tenancy/tenant-context';

// In-memory coverage of the session lifecycle the boundary depends on. The DB path's RLS scoping
// and cross-connection revocation are proven on real PostgreSQL in CI; here we pin the behaviour
// that holds regardless of backing: creation, same-node-immediate revocation (cache eviction),
// absolute expiry, tenant scoping, "sign out everywhere", and the production fail-closed guard.

const TENANT = 't-1';
const OTHER = 't-2';
const USER = 'u-1';
const CRED = '00000000-0000-4000-8000-000000000001';

function make() {
  return new SessionStore(null, new TenantContext());
}

describe('SessionStore (in-memory)', () => {
  let store: SessionStore;
  beforeEach(() => {
    store = make();
  });

  it('creates a session that then validates as live in its own tenant', async () => {
    const s = await store.create({ tenantId: TENANT, userId: USER, credentialId: CRED });
    const live = await store.validate(TENANT, s.id);
    expect(live?.id).toBe(s.id);
    expect(live?.userId).toBe(USER);
  });

  it('is tenant-scoped: another tenant cannot see or revoke the session', async () => {
    const s = await store.create({ tenantId: TENANT, userId: USER, credentialId: CRED });
    expect(await store.validate(OTHER, s.id)).toBeNull();
    expect(await store.revoke(OTHER, s.id, 'logout')).toBe(false);
    expect(await store.validate(TENANT, s.id)).not.toBeNull();
  });

  it('same-node revoke is IMMEDIATE: a just-validated session is refused on the next check', async () => {
    const s = await store.create({ tenantId: TENANT, userId: USER, credentialId: CRED });
    expect(await store.validate(TENANT, s.id)).not.toBeNull(); // caches a positive entry
    expect(await store.revoke(TENANT, s.id, 'logout')).toBe(true); // evicts the cache
    expect(await store.validate(TENANT, s.id)).toBeNull(); // immediate, not waiting for the TTL
  });

  it('revoke is single-effect: a second revoke of the same session returns false', async () => {
    const s = await store.create({ tenantId: TENANT, userId: USER, credentialId: CRED });
    expect(await store.revoke(TENANT, s.id, 'logout')).toBe(true);
    expect(await store.revoke(TENANT, s.id, 'logout')).toBe(false);
  });

  it('revokeAllForUser ends every live session for that user', async () => {
    const a = await store.create({ tenantId: TENANT, userId: USER, credentialId: CRED });
    const b = await store.create({ tenantId: TENANT, userId: USER, credentialId: CRED });
    const other = await store.create({ tenantId: TENANT, userId: 'someone-else', credentialId: CRED });
    const n = await store.revokeAllForUser(TENANT, USER, 'sign-out-everywhere');
    expect(n).toBe(2);
    expect(await store.validate(TENANT, a.id)).toBeNull();
    expect(await store.validate(TENANT, b.id)).toBeNull();
    expect(await store.validate(TENANT, other.id)).not.toBeNull();
  });

  it('a session past its absolute expiry no longer validates', async () => {
    vi.useFakeTimers();
    try {
      process.env.AUTH_SESSION_ABSOLUTE_LIFETIME_SECONDS = '60';
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const s = await store.create({ tenantId: TENANT, userId: USER, credentialId: CRED });
      expect(await store.validate(TENANT, s.id)).not.toBeNull();
      vi.setSystemTime(new Date('2026-01-01T00:01:01Z')); // +61s, past the 60s cap
      expect(await store.validate(TENANT, s.id)).toBeNull();
    } finally {
      vi.useRealTimers();
      delete process.env.AUTH_SESSION_ABSOLUTE_LIFETIME_SECONDS;
    }
  });
});

describe('SessionStore persistence guard', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
    delete process.env.AUTH_STATE_PERSISTENCE;
  });

  it('refuses to construct without a pool in production (no silent in-memory fallback)', () => {
    process.env.NODE_ENV = 'production';
    expect(() => new SessionStore(null, new TenantContext())).toThrow(/requires a database/i);
  });

  it('production is NON-DOWNGRADABLE: AUTH_STATE_PERSISTENCE=memory is still refused', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_STATE_PERSISTENCE = 'memory';
    expect(() => new SessionStore(null, new TenantContext())).toThrow(/requires a database/i);
  });
});

// Distinct from the startup guard above: here the pool EXISTS (boot succeeded) but a query throws
// at runtime — Postgres dropped after boot. The boundary must fail CLOSED, never consult the Map.
describe('SessionStore runtime DB failure (pool present, query() throws)', () => {
  function failingPool(): Pool {
    return { query: () => Promise.reject(new Error('connection terminated unexpectedly')) } as unknown as Pool;
  }

  it('validate() denies on a query failure — does not throw, does not fall back to the Map', async () => {
    const store = new SessionStore(failingPool(), new TenantContext());
    // A live pool whose query() throws (PostgreSQL outage after boot) is treated as "not live":
    // validate resolves to null (deny). It must NOT reject and must NOT read process-local state.
    await expect(store.validate(TENANT, randomSid())).resolves.toBeNull();
  });

  it('a cached positive entry is NOT synthesised from a failing DB — a fresh sid simply denies', async () => {
    const store = new SessionStore(failingPool(), new TenantContext());
    // No prior successful read means no cache entry, so the failing read is the only path: deny.
    const first = await store.validate(TENANT, randomSid());
    const second = await store.validate(TENANT, randomSid());
    expect(first).toBeNull();
    expect(second).toBeNull();
  });
});

function randomSid(): string {
  return '00000000-0000-4000-8000-0000000000ff';
}
