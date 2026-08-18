import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { generateRefreshToken, hashRefreshToken } from '@aura/shared';
import { PG_POOL } from '../events/pg-pool';
import { TX_RUNNER, type TxRunner } from '../events/tx';
import { TenantContext } from '../tenancy/tenant-context';
import { SessionStore } from './session.store';
import { UsersService } from './users.service';

// Opaque refresh tokens with rotation + replay containment (S2, migration 0235
// `auth_refresh_tokens`). The long-lived half of a session, deliberately NOT a JWT: a
// high-entropy secret whose SHA-256 hash is all the server stores.
//
// Refresh rotation is NOT merely token persistence — it is a transaction over the refresh-token /
// SESSION aggregate. So rotation runs as ONE PostgreSQL transaction on ONE client, and everything
// that decides whether R2 may exist is validated INSIDE it, holding row locks:
//
//   BEGIN
//     SELECT R1 (tenant_id, token_hash) FOR UPDATE          -- serialise concurrent presentations
//     classify: unknown/revoked/expired → deny · consumed → REPLAY (revoke family + session)
//     SELECT auth_sessions (id = R1.session_id) FOR UPDATE  -- lock order: R1 then session, always
//     validate session IN-TX: revoked_at IS NULL · not past absolute cap · not idle
//     validate user IN-TX:    public.aura_users.active is not false (unregistered ⇒ active)
//     ineligible → revoke family + session, COMMIT, return invalid
//     consume R1 · insert R2 (same family) · UPDATE auth_sessions.last_seen_at = now()
//   COMMIT   →   only then does the orchestrator mint A2
//
// The FOR UPDATE on R1 serialises `R1 || R1`: the first presentation locks it, consumes it, and
// commits; the second BLOCKS, then reads R1 as 'consumed' → replay. There is no window in which a
// committed active R2 exists for a token that was not active, or for a session that was not live,
// absolute-valid, idle-valid and user-eligible in the SAME transaction. Refresh never consults the
// access-boundary session cache — it reads persistent state directly, on the cold authoritative path.
//
// PERSISTENCE IS NOT OPTIONAL IN PRODUCTION — fail-closed and non-downgradable, like the other stores.

export type RotateOutcome =
  | { kind: 'rotated'; sessionId: string; userId: string; familyId: string; token: string; expiresAt: number }
  | { kind: 'replay'; sessionId: string; familyId: string } // known-consumed token reused → contained
  | { kind: 'invalid'; reason?: string }; // unknown / expired / revoked / ineligible (reason: diag only)

export interface IssuedRefreshToken {
  token: string;
  familyId: string;
  expiresAt: number;
}

interface RefreshRow {
  id: string;
  tenantId: string;
  sessionId: string;
  familyId: string;
  tokenHash: string;
  state: 'active' | 'consumed' | 'revoked';
  replacedBy: string | null;
  expiresAt: number;
}

/** Refresh-token lifetime. Long-lived (the session's longevity), configurable (30d default). */
function refreshTtlSeconds(): number {
  const raw = Number(process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30 * 24 * 60 * 60;
}

/** Idle-timeout window (seconds). Separate from the absolute cap; evaluated at the refresh gate. */
function idleTimeoutSeconds(): number {
  const raw = Number(process.env.AUTH_SESSION_IDLE_TIMEOUT_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : 60 * 60;
}

@Injectable()
export class RefreshTokenStore {
  private readonly logger = new Logger('RefreshTokenStore');
  private readonly local = new Map<string, RefreshRow>(); // key: token hash
  /** Per-token critical-section chains — the in-memory stand-in for `SELECT … FOR UPDATE`. */
  private readonly chains = new Map<string, Promise<unknown>>();

  /**
   * Serialise the whole rotate critical section for one token hash, so a concurrent presentation
   * of the SAME token cannot interleave with (and issue an R2 inside) a family the other request is
   * containing. This is what a row lock gives the DB path; here single-threaded execution + this
   * chain give the identical externally-observable state machine.
   */
  private lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.chains.set(key, run.then(() => undefined, () => undefined));
    return run;
  }

  constructor(
    @Optional() @Inject(PG_POOL) private readonly pool: Pool | null,
    @Optional() @Inject(TX_RUNNER) private readonly tx: TxRunner | null,
    private readonly tenant: TenantContext,
    private readonly sessionStore: SessionStore,
    private readonly users: UsersService,
  ) {
    if (!this.pool && this.persistenceRequired()) {
      throw new Error(
        'RefreshTokenStore requires a database (PG_POOL) in production — refusing to fall back to in-memory refresh state.',
      );
    }
    if (!this.pool) {
      this.logger.warn('RefreshTokenStore: no PG_POOL — using the in-memory implementation (dev/test only).');
    }
  }

  private persistenceRequired(): boolean {
    if (process.env.NODE_ENV === 'production') return true;
    return process.env.AUTH_STATE_PERSISTENCE?.trim().toLowerCase() === 'required';
  }

  private run<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.tenant.run({ ...this.tenant.get(), tenantId }, fn);
  }

  /**
   * Issue the FIRST refresh token of a session (login) — starts a new family — or, with a
   * `familyId`, extend an existing family. Called with the tenant already bound (during login).
   */
  async issueForSession(tenantId: string, sessionId: string, familyId?: string): Promise<IssuedRefreshToken> {
    const token = generateRefreshToken();
    const tokenHash = hashRefreshToken(token);
    const id = randomUUID();
    const family = familyId ?? randomUUID();
    const expiresAt = Date.now() + refreshTtlSeconds() * 1000;
    if (!this.pool) {
      this.local.set(tokenHash, { id, tenantId, sessionId, familyId: family, tokenHash, state: 'active', replacedBy: null, expiresAt });
      return { token, familyId: family, expiresAt };
    }
    await this.run(tenantId, () =>
      this.pool!.query(
        `INSERT INTO public.auth_refresh_tokens
           (id, tenant_id, session_id, family_id, token_hash, state, replaced_by, expires_at, consumed_at, created_at)
         VALUES ($1, $2, $3, $4, $5, 'active', NULL, to_timestamp($6 / 1000.0), NULL, now())`,
        [id, tenantId, sessionId, family, tokenHash, expiresAt],
      ),
    );
    return { token, familyId: family, expiresAt };
  }

  /**
   * Rotate a presented refresh token. One transaction over the refresh-token/session aggregate:
   * R1 is single-use, the session + user are validated in the same transaction under row locks, and
   * a spent token being reused contains the whole family and the session. Returns the new token +
   * the session's user on success; `replay` / `invalid` otherwise (all opaque to the caller).
   */
  async rotate(tenantId: string, presented: string): Promise<RotateOutcome> {
    if (!presented) return { kind: 'invalid', reason: 'empty' };
    const hash = hashRefreshToken(presented);
    const newToken = generateRefreshToken();
    const newHash = hashRefreshToken(newToken);
    const newId = randomUUID();
    const expiresAt = Date.now() + refreshTtlSeconds() * 1000;

    if (!this.pool) return this.rotateInMemory(tenantId, hash, newToken, newHash, newId, expiresAt);
    if (!this.tx) throw new Error('RefreshTokenStore: TX_RUNNER is required for atomic rotation');

    return this.run(tenantId, () =>
      this.tx!.run(async (handle) => {
        const client = handle as PoolClient;
        // 1. Lock R1 (serialises R1 || R1).
        const r1 = await client.query<{ id: string; session_id: string; family_id: string; state: string; expired: boolean }>(
          `SELECT id, session_id, family_id, state, (expires_at <= now()) AS expired
             FROM public.auth_refresh_tokens WHERE tenant_id=$1 AND token_hash=$2 FOR UPDATE`,
          [tenantId, hash],
        );
        if (r1.rowCount === 0) {
          this.logger.warn('rotate deny: refresh token not found for this tenant');
          return { kind: 'invalid', reason: 'not-found' }; // unknown
        }
        const t = r1.rows[0];

        // 2. Classify. Only a KNOWN, previously-consumed token is a replay.
        if (t.state === 'consumed') {
          await this.containFamily(client, tenantId, t.family_id, t.session_id, 'refresh_replay');
          this.logger.warn(`refresh replay detected — family ${t.family_id} contained`);
          return { kind: 'replay', sessionId: t.session_id, familyId: t.family_id };
        }
        if (t.state !== 'active' || t.expired) {
          this.logger.warn(`rotate deny: token state=${t.state} expired=${t.expired}`);
          return { kind: 'invalid', reason: `state:${t.state}/expired:${t.expired}` }; // revoked / expired
        }

        // 3. Lock the session (lock order: R1 then session, everywhere).
        const ses = await client.query<{ user_id: string; ineligible: boolean }>(
          `SELECT user_id,
                  (revoked_at IS NOT NULL
                   OR expires_at <= now()
                   OR now() - COALESCE(last_seen_at, created_at) > make_interval(secs => COALESCE(idle_timeout_seconds, $3::int))
                  ) AS ineligible
             FROM public.auth_sessions WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [tenantId, t.session_id, idleTimeoutSeconds()],
        );
        const s = ses.rows[0];
        // 4 + 5. Session live/absolute/idle AND user active — all IN THIS TRANSACTION.
        let denyReason: string | null = null;
        if (!s || s.ineligible) {
          denyReason = `session:${!s ? 'missing' : 'flags'}`;
          this.logger.warn(`rotate deny: session ineligible (missing=${!s} flags=${s?.ineligible})`);
        } else {
          const u = await client.query<{ active: boolean }>(
            `SELECT active FROM public.aura_users WHERE tenant_id=$1 AND user_id=$2`,
            [tenantId, s.user_id],
          );
          // FAIL-CLOSED for refresh: a missing user row is ineligible (login already requires a
          // registry row, so a legitimate refresh always has one; a deleted row must deny).
          if ((u.rowCount ?? 0) === 0 || u.rows[0].active === false) {
            denyReason = `user:rows=${u.rowCount}/active=${u.rows[0]?.active}`;
            this.logger.warn(`rotate deny: user ineligible (${denyReason}) for ${s.user_id}`);
          }
        }
        // 6. Ineligible → the family and the session die; R1 is NOT consumed into a usable R2.
        if (denyReason) {
          await this.containFamily(client, tenantId, t.family_id, t.session_id, 'refresh_ineligible');
          return { kind: 'invalid', reason: denyReason };
        }

        // 7. Consume R1. 8. Issue R2. 9. Advance the session's idle clock — all before COMMIT.
        await client.query(
          `UPDATE public.auth_refresh_tokens SET state='consumed', consumed_at=now(), replaced_by=$3
             WHERE tenant_id=$1 AND id=$2`,
          [tenantId, t.id, newId],
        );
        await client.query(
          `INSERT INTO public.auth_refresh_tokens
             (id, tenant_id, session_id, family_id, token_hash, state, replaced_by, expires_at, consumed_at, created_at)
           VALUES ($1, $2, $3, $4, $5, 'active', NULL, to_timestamp($6 / 1000.0), NULL, now())`,
          [newId, tenantId, t.session_id, t.family_id, newHash, expiresAt],
        );
        await client.query(`UPDATE public.auth_sessions SET last_seen_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, t.session_id]);
        return { kind: 'rotated', sessionId: t.session_id, userId: s.user_id, familyId: t.family_id, token: newToken, expiresAt };
      }),
    );
  }

  /** Revoke every non-revoked token in a family, and revoke its session (replay + ineligibility). */
  private async containFamily(client: PoolClient, tenantId: string, familyId: string, sessionId: string, reason: string): Promise<void> {
    await client.query(
      `UPDATE public.auth_refresh_tokens SET state='revoked'
         WHERE tenant_id=$1 AND family_id=$2 AND state IN ('active','consumed')`,
      [tenantId, familyId],
    );
    await client.query(
      `UPDATE public.auth_sessions
          SET revoked_at = COALESCE(revoked_at, now()), revoked_reason = COALESCE(revoked_reason, $3)
        WHERE tenant_id=$1 AND id=$2`,
      [tenantId, sessionId, reason],
    );
  }

  /** Revoke a whole family (admin / containment). */
  async revokeFamily(tenantId: string, familyId: string, _reason: string): Promise<number> {
    if (!this.pool) return this.revokeFamilyLocal(tenantId, familyId);
    const res = await this.run(tenantId, () =>
      this.pool!.query(
        `UPDATE public.auth_refresh_tokens SET state='revoked'
           WHERE tenant_id=$1 AND family_id=$2 AND state IN ('active','consumed')`,
        [tenantId, familyId],
      ),
    );
    return res.rowCount ?? 0;
  }

  /** Revoke every active token for a session (logout / session revocation). */
  async revokeForSession(tenantId: string, sessionId: string): Promise<number> {
    if (!this.pool) {
      let n = 0;
      for (const r of this.local.values()) {
        if (r.tenantId === tenantId && r.sessionId === sessionId && r.state !== 'revoked') {
          r.state = 'revoked';
          n++;
        }
      }
      return n;
    }
    const res = await this.run(tenantId, () =>
      this.pool!.query(
        `UPDATE public.auth_refresh_tokens SET state='revoked'
           WHERE tenant_id=$1 AND session_id=$2 AND state IN ('active','consumed')`,
        [tenantId, sessionId],
      ),
    );
    return res.rowCount ?? 0;
  }

  private revokeFamilyLocal(tenantId: string, familyId: string): number {
    let n = 0;
    for (const r of this.local.values()) {
      if (r.tenantId === tenantId && r.familyId === familyId && r.state !== 'revoked') {
        r.state = 'revoked';
        n++;
      }
    }
    return n;
  }

  /**
   * In-memory rotation reproducing the SAME externally-observable state machine (dev/test only).
   * The ENTIRE critical section runs under a per-token lock (the FOR UPDATE stand-in), so a
   * concurrent presentation of the same token waits, then sees it consumed → replay. It reads raw
   * session state (SessionStore.get — never the access cache) + user activity, is FAIL-CLOSED on a
   * missing user row, and contains the family + session on replay / ineligibility.
   */
  private rotateInMemory(tenantId: string, hash: string, newToken: string, newHash: string, newId: string, expiresAt: number): Promise<RotateOutcome> {
    return this.lock(hash, async () => {
      const now = Date.now();
      const t = this.local.get(hash);
      if (!t || t.tenantId !== tenantId) return { kind: 'invalid', reason: 'not-found' };
      if (t.state === 'consumed') {
        await this.containLocal(tenantId, t.familyId, t.sessionId, 'refresh_replay');
        return { kind: 'replay', sessionId: t.sessionId, familyId: t.familyId };
      }
      if (t.state !== 'active' || t.expiresAt <= now) return { kind: 'invalid', reason: `state:${t.state}` };

      // Raw session state (NOT the access-boundary cache) + user activity, in the critical section.
      const s = await this.sessionStore.get(tenantId, t.sessionId);
      const u = s ? this.users.get(tenantId, s.userId) : null;
      const idleWindowMs = (s?.idleTimeoutSeconds ?? idleTimeoutSeconds()) * 1000;
      const ineligible =
        !s ||
        s.revokedAt !== null ||
        s.expiresAt <= now ||
        now - (s.lastSeenAt ?? s.createdAt) > idleWindowMs ||
        !u || // FAIL-CLOSED: a missing user row is ineligible, even though isActive() would say true
        u.active === false;
      if (ineligible) {
        await this.containLocal(tenantId, t.familyId, t.sessionId, 'refresh_ineligible');
        return { kind: 'invalid', reason: 'ineligible' };
      }

      t.state = 'consumed';
      t.replacedBy = newId;
      this.local.set(newHash, { id: newId, tenantId, sessionId: t.sessionId, familyId: t.familyId, tokenHash: newHash, state: 'active', replacedBy: null, expiresAt });
      await this.sessionStore.touch(tenantId, t.sessionId);
      return { kind: 'rotated', sessionId: t.sessionId, userId: s!.userId, familyId: t.familyId, token: newToken, expiresAt };
    });
  }

  private async containLocal(tenantId: string, familyId: string, sessionId: string, reason: string): Promise<void> {
    this.revokeFamilyLocal(tenantId, familyId);
    await this.sessionStore.revoke(tenantId, sessionId, reason);
  }
}
