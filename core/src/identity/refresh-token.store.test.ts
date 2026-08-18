import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RefreshTokenStore } from './refresh-token.store';
import { SessionStore } from './session.store';
import { UsersService } from './users.service';
import { TenantContext } from '../tenancy/tenant-context';

// In-memory coverage of the rotation state machine + the in-transaction eligibility gate. The DB
// path's ATOMIC single-use under true concurrent transactions (R1 || R1) is proven on real
// PostgreSQL in CI; these pin the externally-observable semantics: rotation, single-use, replay →
// family + session containment, session/user eligibility, tenant scoping, and the fail-closed guard.

const TENANT = 't-1';
const OTHER = 't-2';
const USER = 'u-1';
const CRED = '00000000-0000-4000-8000-000000000001';

interface Harness {
  tenant: TenantContext;
  sessions: SessionStore;
  users: UsersService;
  store: RefreshTokenStore;
}

function harness(): Harness {
  const tenant = new TenantContext();
  const sessions = new SessionStore(null, tenant);
  const users = new UsersService(null);
  const store = new RefreshTokenStore(null, null, tenant, sessions, users);
  return { tenant, sessions, users, store };
}

async function liveSession(h: Harness, userId = USER): Promise<string> {
  h.users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
  const s = await h.sessions.create({ tenantId: TENANT, userId, credentialId: CRED });
  return s.id;
}

describe('RefreshTokenStore rotation (in-memory)', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it('rotates a token for a live, eligible session into a fresh one', async () => {
    const sid = await liveSession(h);
    const issued = await h.store.issueForSession(TENANT, sid);
    const out = await h.store.rotate(TENANT, issued.token);
    expect(out.kind).toBe('rotated');
    if (out.kind === 'rotated') {
      expect(out.sessionId).toBe(sid);
      expect(out.userId).toBe(USER);
      expect(out.token).not.toBe(issued.token);
    }
  });

  it('is single-use: replaying a consumed token is a REPLAY that contains the family AND the session', async () => {
    const sid = await liveSession(h);
    const issued = await h.store.issueForSession(TENANT, sid);
    const rotated = await h.store.rotate(TENANT, issued.token);
    const successor = rotated.kind === 'rotated' ? rotated.token : '';

    const replay = await h.store.rotate(TENANT, issued.token);
    expect(replay.kind).toBe('replay');
    // The successor is dead …
    expect((await h.store.rotate(TENANT, successor)).kind).toBe('invalid');
    // … and the SESSION was revoked by the containment.
    expect((await h.sessions.get(TENANT, sid))?.revokedAt).not.toBeNull();
  });

  it('R1 || R1 → one rotation, one replay, family + session contained, resulting R2 unusable', async () => {
    const sid = await liveSession(h);
    const issued = await h.store.issueForSession(TENANT, sid);
    const [a, b] = await Promise.all([h.store.rotate(TENANT, issued.token), h.store.rotate(TENANT, issued.token)]);
    expect([a.kind, b.kind].sort()).toEqual(['replay', 'rotated']);

    // The replay contained the family and the session, so the winner's R2 is dead too …
    const winnerToken = a.kind === 'rotated' ? a.token : b.kind === 'rotated' ? b.token : '';
    expect((await h.store.rotate(TENANT, winnerToken)).kind).toBe('invalid');
    // … and the session is revoked (so its access tokens fail the sid boundary as well).
    expect((await h.sessions.get(TENANT, sid))?.revokedAt).not.toBeNull();
  });

  it('refuses an unknown token', async () => {
    expect((await h.store.rotate(TENANT, 'nope')).kind).toBe('invalid');
    expect((await h.store.rotate(TENANT, '')).kind).toBe('invalid');
  });

  it('is tenant-scoped: another tenant cannot rotate the token', async () => {
    const sid = await liveSession(h);
    const issued = await h.store.issueForSession(TENANT, sid);
    expect((await h.store.rotate(OTHER, issued.token)).kind).toBe('invalid');
    expect((await h.store.rotate(TENANT, issued.token)).kind).toBe('rotated');
  });

  it('refuses to rotate for a REVOKED session (eligibility gate)', async () => {
    const sid = await liveSession(h);
    const issued = await h.store.issueForSession(TENANT, sid);
    await h.sessions.revoke(TENANT, sid, 'logout');
    expect((await h.store.rotate(TENANT, issued.token)).kind).toBe('invalid');
  });

  it('refuses to rotate for a DEACTIVATED user, and contains the session', async () => {
    const sid = await liveSession(h);
    const issued = await h.store.issueForSession(TENANT, sid);
    h.users.setActive(TENANT, USER, false);
    expect((await h.store.rotate(TENANT, issued.token)).kind).toBe('invalid');
    expect((await h.sessions.get(TENANT, sid))?.revokedAt).not.toBeNull();
  });

  it('refuses to rotate once the session is IDLE past its window', async () => {
    vi.useFakeTimers();
    try {
      process.env.AUTH_SESSION_IDLE_TIMEOUT_SECONDS = '60';
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const sid = await liveSession(h);
      const issued = await h.store.issueForSession(TENANT, sid);
      vi.setSystemTime(new Date('2026-01-01T00:01:01Z')); // +61s, past the 60s idle window
      expect((await h.store.rotate(TENANT, issued.token)).kind).toBe('invalid');
    } finally {
      vi.useRealTimers();
      delete process.env.AUTH_SESSION_IDLE_TIMEOUT_SECONDS;
    }
  });

  it('revokeForSession stops the token from rotating (logout)', async () => {
    const sid = await liveSession(h);
    const issued = await h.store.issueForSession(TENANT, sid);
    expect(await h.store.revokeForSession(TENANT, sid)).toBe(1);
    expect((await h.store.rotate(TENANT, issued.token)).kind).toBe('invalid');
  });
});

describe('RefreshTokenStore persistence guard', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
    delete process.env.AUTH_STATE_PERSISTENCE;
  });

  it('refuses to construct without a pool in production (no silent in-memory fallback)', () => {
    process.env.NODE_ENV = 'production';
    const t = new TenantContext();
    expect(() => new RefreshTokenStore(null, null, t, new SessionStore(null, t), new UsersService(null))).toThrow(/requires a database/i);
  });

  it('production is NON-DOWNGRADABLE: AUTH_STATE_PERSISTENCE=memory is still refused', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_STATE_PERSISTENCE = 'memory';
    const t = new TenantContext();
    expect(() => new RefreshTokenStore(null, null, t, new SessionStore(null, t), new UsersService(null))).toThrow(/requires a database/i);
  });
});
