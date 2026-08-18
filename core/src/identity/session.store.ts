import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';
import { TenantContext } from '../tenancy/tenant-context';

// Authoritative session state (S2, migration 0235 `auth_sessions`). A session exists ONLY once
// every authentication requirement is satisfied; its `id` is the `sid` carried in the access
// token, and `revoked_at` is the single switch that ends it.
//
// The access-token boundary consults this on every request via `validate()`, which is backed by a
// short-TTL positive cache so the hot path is not one DB round-trip per call. Two revocation
// guarantees, kept DISTINCT and tested separately:
//
//   - Same node as the revoke: IMMEDIATE — `revoke()` evicts the cache entry, so the next request
//     on this node re-reads and sees the revocation.
//   - Another replica: bounded by the cache TTL — a positive entry cached there stays valid until
//     it expires. This is NOT cluster-wide-immediate revocation, and must never be described as
//     such; distributed invalidation (pub/sub) would be a later addition.
//
// Absolute expiry is enforced from the cached record itself (time-based, never stale). Refresh
// verification does NOT use this cache — it hits authoritative state directly (RefreshTokenStore).
//
// PERSISTENCE IS NOT OPTIONAL IN PRODUCTION. Like the challenge store, the in-memory Map is a
// dev/test implementation, never a silent production fallback: production refuses to construct
// without a database and is NON-DOWNGRADABLE (`AUTH_STATE_PERSISTENCE=memory` is rejected), so a
// misconfig cannot move session state into a process-local Map a restart would erase.

export interface SessionRecord {
  /** The `sid`. */
  id: string;
  tenantId: string;
  userId: string;
  credentialId: string;
  createdAt: number;
  /** Advanced on the refresh path (RefreshTokenStore) to drive the idle timeout. */
  lastSeenAt: number | null;
  /** Per-session idle override (seconds); null ⇒ the deployment default. Enforced with refresh. */
  idleTimeoutSeconds: number | null;
  /** Absolute lifetime cap (epoch ms). */
  expiresAt: number;
  /** null = live. */
  revokedAt: number | null;
  revokedReason: string | null;
}

/** Absolute session lifetime cap. Configurable default (12h), NOT hard-coded policy. */
function absoluteLifetimeSeconds(): number {
  const raw = Number(process.env.AUTH_SESSION_ABSOLUTE_LIFETIME_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : 12 * 60 * 60;
}

interface CacheEntry {
  record: SessionRecord;
  cachedAt: number;
}

@Injectable()
export class SessionStore {
  private readonly logger = new Logger('SessionStore');
  private readonly sessions = new Map<string, SessionRecord>();
  /** Short-TTL positive cache for the access-token boundary. */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null,
    private readonly tenant: TenantContext,
  ) {
    if (!this.pool && this.persistenceRequired()) {
      throw new Error(
        'SessionStore requires a database (PG_POOL) in production — refusing to fall back to in-memory session state.',
      );
    }
    if (!this.pool) {
      this.logger.warn('SessionStore: no PG_POOL — using the in-memory implementation (dev/test only).');
    }
  }

  /** Production must persist; non-downgradable. `required` also forces persistence in non-prod. */
  private persistenceRequired(): boolean {
    if (process.env.NODE_ENV === 'production') return true;
    return process.env.AUTH_STATE_PERSISTENCE?.trim().toLowerCase() === 'required';
  }

  private cacheTtlMs(): number {
    const raw = Number(process.env.AUTH_SESSION_CACHE_TTL_MS);
    return Number.isFinite(raw) && raw >= 0 ? raw : 5000;
  }

  /** Bind the given (trusted) tenant for a scoped query, preserving the rest of the context. */
  private run<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.tenant.run({ ...this.tenant.get(), tenantId }, fn);
  }

  /**
   * Create a session for a fully-authenticated identity. Called with the tenant already bound
   * (during login). Sets the absolute expiry; idle/last_seen advance later on the refresh path.
   */
  async create(input: { tenantId: string; userId: string; credentialId: string }): Promise<SessionRecord> {
    const now = Date.now();
    const record: SessionRecord = {
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      credentialId: input.credentialId,
      createdAt: now,
      lastSeenAt: null,
      idleTimeoutSeconds: null,
      expiresAt: now + absoluteLifetimeSeconds() * 1000,
      revokedAt: null,
      revokedReason: null,
    };
    if (!this.pool) {
      this.sessions.set(record.id, { ...record });
      return record;
    }
    await this.run(record.tenantId, () =>
      this.pool!.query(
        `INSERT INTO public.auth_sessions
           (id, tenant_id, user_id, credential_id, created_at, last_seen_at, idle_timeout_seconds, expires_at, revoked_at, revoked_reason)
         VALUES ($1, $2, $3, $4, now(), NULL, NULL, to_timestamp($5 / 1000.0), NULL, NULL)`,
        [record.id, record.tenantId, record.userId, record.credentialId, record.expiresAt],
      ),
    );
    return record;
  }

  /** Raw fetch of one session (no liveness judgement). Self-binds the trusted tenant. */
  async get(tenantId: string, sid: string): Promise<SessionRecord | null> {
    if (!sid) return null;
    if (!this.pool) {
      const s = this.sessions.get(sid);
      return s && s.tenantId === tenantId ? { ...s } : null;
    }
    const { rows } = await this.run(tenantId, () =>
      this.pool!.query<{
        id: string;
        tenant_id: string;
        user_id: string;
        credential_id: string;
        created_at: string;
        last_seen_at: string | null;
        idle_timeout_seconds: number | null;
        expires_at: string;
        revoked_at: string | null;
        revoked_reason: string | null;
      }>(
        `SELECT id, tenant_id, user_id, credential_id,
                (extract(epoch from created_at) * 1000)::bigint AS created_at,
                (extract(epoch from last_seen_at) * 1000)::bigint AS last_seen_at,
                idle_timeout_seconds,
                (extract(epoch from expires_at) * 1000)::bigint AS expires_at,
                (extract(epoch from revoked_at) * 1000)::bigint AS revoked_at,
                revoked_reason
           FROM public.auth_sessions WHERE tenant_id = $1 AND id = $2`,
        [tenantId, sid],
      ),
    );
    const r = rows[0];
    return r ? this.fromRow(r) : null;
  }

  /**
   * The access-token boundary check: return a LIVE session (exists · not revoked · not past its
   * absolute expiry) or null. Backed by the short-TTL positive cache. `user-active` is enforced
   * separately by the PermissionsGuard; this method owns session revocation + absolute expiry.
   */
  async validate(tenantId: string, sid: string | undefined | null): Promise<SessionRecord | null> {
    if (!sid) return null;
    const now = Date.now();
    const cached = this.cache.get(sid);
    if (cached && now - cached.cachedAt < this.cacheTtlMs()) {
      // Absolute expiry is time-based, so it is enforceable straight from the cached record; a
      // revocation on another node is the only thing this positive entry can be stale about.
      if (cached.record.tenantId === tenantId && cached.record.revokedAt === null && cached.record.expiresAt > now) {
        return cached.record;
      }
      this.cache.delete(sid);
    }
    let record: SessionRecord | null;
    try {
      record = await this.get(tenantId, sid);
    } catch (err) {
      // FAIL CLOSED. A database error at the boundary DENIES — it must NEVER fall back to the
      // in-memory Map or wave the request through. This is the Postgres-drops-after-boot case, not
      // a misconfiguration: a live pool whose query() throws is a "session not live", exactly like
      // a revoked or absent one. (A still-cached positive entry is honoured for its ≤ TTL window;
      // this is only the cache-miss read.)
      this.logger.error(`session validate for ${sid} failed CLOSED (denied): ${(err as Error).message}`);
      return null;
    }
    if (!record || record.revokedAt !== null || record.expiresAt <= now) return null;
    this.cache.set(sid, { record, cachedAt: now });
    return record;
  }

  /**
   * Evict the boundary cache entry for a session (cache-only, no DB write). Used when the session
   * was already revoked through another path — the refresh replay/ineligibility containment revokes
   * it in SQL inside the rotation transaction — so this node stops honouring a cached positive entry
   * for its access tokens immediately, rather than after the cache TTL.
   */
  evict(sid: string): void {
    this.cache.delete(sid);
  }

  /** Revoke one session. Evicts the local cache so this node refuses it immediately. */
  async revoke(tenantId: string, sid: string, reason: string): Promise<boolean> {
    this.cache.delete(sid);
    if (!this.pool) {
      const s = this.sessions.get(sid);
      if (!s || s.tenantId !== tenantId || s.revokedAt !== null) return false;
      s.revokedAt = Date.now();
      s.revokedReason = reason;
      return true;
    }
    const { rows } = await this.run(tenantId, () =>
      this.pool!.query<{ id: string }>(
        `UPDATE public.auth_sessions SET revoked_at = now(), revoked_reason = $3
           WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL RETURNING id`,
        [tenantId, sid, reason],
      ),
    );
    return rows.length > 0;
  }

  /** Revoke every live session for a user ("sign out everywhere"). Returns the count revoked. */
  async revokeAllForUser(tenantId: string, userId: string, reason: string): Promise<number> {
    if (!this.pool) {
      let n = 0;
      for (const s of this.sessions.values()) {
        if (s.tenantId === tenantId && s.userId === userId && s.revokedAt === null) {
          s.revokedAt = Date.now();
          s.revokedReason = reason;
          this.cache.delete(s.id);
          n++;
        }
      }
      return n;
    }
    const { rows } = await this.run(tenantId, () =>
      this.pool!.query<{ id: string }>(
        `UPDATE public.auth_sessions SET revoked_at = now(), revoked_reason = $3
           WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`,
        [tenantId, userId, reason],
      ),
    );
    for (const r of rows) this.cache.delete(r.id);
    return rows.length;
  }

  /** Advance liveness (refresh path; drives the idle timeout in RefreshTokenStore). */
  async touch(tenantId: string, sid: string): Promise<void> {
    if (!this.pool) {
      const s = this.sessions.get(sid);
      if (s && s.tenantId === tenantId) s.lastSeenAt = Date.now();
      return;
    }
    await this.run(tenantId, () =>
      this.pool!.query(`UPDATE public.auth_sessions SET last_seen_at = now() WHERE tenant_id = $1 AND id = $2`, [
        tenantId,
        sid,
      ]),
    );
  }

  private fromRow(r: {
    id: string;
    tenant_id: string;
    user_id: string;
    credential_id: string;
    created_at: string;
    last_seen_at: string | null;
    idle_timeout_seconds: number | null;
    expires_at: string;
    revoked_at: string | null;
    revoked_reason: string | null;
  }): SessionRecord {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      userId: r.user_id,
      credentialId: r.credential_id,
      createdAt: Number(r.created_at),
      lastSeenAt: r.last_seen_at === null ? null : Number(r.last_seen_at),
      idleTimeoutSeconds: r.idle_timeout_seconds,
      expiresAt: Number(r.expires_at),
      revokedAt: r.revoked_at === null ? null : Number(r.revoked_at),
      revokedReason: r.revoked_reason,
    };
  }
}
