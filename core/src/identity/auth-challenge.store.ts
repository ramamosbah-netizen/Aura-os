import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';

// Pending authentication challenges — the state between "password proved" and "session issued".
// A challenge is NOT a session: it carries no token, authorizes nothing, and the only thing it
// can be exchanged for is a completed authentication. This is what makes "no successful MFA ⇒ no
// authenticated session" an invariant rather than a code path.
//
// S2: PERSISTED (migration 0235 `auth_challenges`). It used to be an in-memory Map pinned to the
// node that issued it, so a client that landed on another replica had to restart the sign-in, and
// the "one challenge, one session" guarantee held only within a single process. Now:
//
//   - Every method is tenant-scoped and reads/writes through the TenantScopedPool, so RLS scopes
//     the challenge to exactly the tenant that owns it (fail-closed: no tenant bound ⇒ no rows).
//     The caller re-supplies the tenant on the MFA / password-change step — untrusted scoping
//     input, not an authorization claim: RLS confines the lookup to it, and the opaque challenge
//     id plus the MFA/password proof are what actually complete the authentication.
//
//   - `consume` is an ATOMIC `DELETE … RETURNING`, gated on tenant + id + KIND + not-expired: two
//     concurrent correct MFA submissions race on it and exactly ONE wins the row, so exactly one
//     session is minted. Single-use is a property of the delete, not of a check-then-act the two
//     callers could interleave.
//
//   - Expiry is LAZY: every read filters on `expires_at > now()`, so a challenge past its TTL is
//     expired whether or not a row still exists. Space is reclaimed by a PER-TENANT sweep on
//     `issue()` — a global periodic timer is the wrong tool here, because outside a request no
//     tenant is bound and RLS would scope its DELETE to zero rows under the production role.
//     `issue()` always runs with a tenant bound, so it can clear that tenant's expired rows.
//
// PERSISTENCE IS NOT OPTIONAL IN PRODUCTION. The in-memory Map is a dev/test implementation, never
// a silent production fallback: if a database is required (production) and PG_POOL is absent, the
// store REFUSES TO CONSTRUCT rather than quietly keep process-local security state that would
// evaporate on restart and diverge across replicas. A DB error at runtime propagates (fail closed).

export type ChallengeKind = 'mfa' | 'password_change';

export interface AuthChallenge {
  id: string;
  kind: ChallengeKind;
  tenantId: string;
  userId: string;
  credentialId: string;
  /** Carried through so the completed authentication still knows to force a change. */
  mustChangePassword: boolean;
  /** Epoch milliseconds. */
  expiresAt: number;
  attempts: number;
}

/** How long a client has to answer a challenge. Short — this is one step of one sign-in. */
const TTL_MS = 5 * 60 * 1000;
/** Attempts allowed against one challenge before it is destroyed (the account lockout is separate). */
const MAX_ATTEMPTS = 5;

const key = (tenantId: string, id: string): string => `${tenantId} ${id}`;

@Injectable()
export class AuthChallengeStore {
  private readonly logger = new Logger('AuthChallenge');
  private readonly challenges = new Map<string, AuthChallenge>();

  constructor(@Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null) {
    if (!this.pool && this.persistenceRequired()) {
      // Fail closed: a real deployment must not hold authentication state in a process-local Map
      // that a restart erases and a second replica never sees. Refuse to boot instead.
      throw new Error(
        'AuthChallengeStore requires a database (PG_POOL) in production — refusing to fall back to in-memory challenge state.',
      );
    }
    if (!this.pool) {
      this.logger.warn('AuthChallengeStore: no PG_POOL — using the in-memory implementation (dev/test only).');
    }
  }

  /**
   * Production must persist; only dev/test may use the in-memory Map.
   *
   * Production is NON-DOWNGRADABLE: no environment variable can relax it. A bad deployment that
   * sets `AUTH_STATE_PERSISTENCE=memory` in production must still be refused, so a config mistake
   * (or a deliberate one) cannot quietly move authentication state back into a process-local Map.
   * The override only tightens elsewhere: `required` forces persistence in a non-production run
   * (used by the tests that assert fail-closed). There is no accepted value that weakens production.
   */
  private persistenceRequired(): boolean {
    if (process.env.NODE_ENV === 'production') return true;
    return process.env.AUTH_STATE_PERSISTENCE?.trim().toLowerCase() === 'required';
  }

  /**
   * Open a challenge for an identity whose password has already verified. The tenant MUST be
   * bound (this runs inside `AuthenticationService.inTenant`), so the INSERT is scoped, the RLS
   * `with check` passes, and the per-tenant sweep below can reclaim this tenant's expired rows.
   */
  async issue(input: {
    kind: ChallengeKind;
    tenantId: string;
    userId: string;
    credentialId: string;
    mustChangePassword: boolean;
  }): Promise<AuthChallenge> {
    const challenge: AuthChallenge = {
      id: randomUUID(),
      kind: input.kind,
      tenantId: input.tenantId,
      userId: input.userId,
      credentialId: input.credentialId,
      mustChangePassword: input.mustChangePassword,
      expiresAt: Date.now() + TTL_MS,
      attempts: 0,
    };
    if (!this.pool) {
      this.sweepMemory(challenge.tenantId);
      this.challenges.set(key(challenge.tenantId, challenge.id), { ...challenge });
      return challenge;
    }
    // Reclaim this tenant's expired rows opportunistically (the RLS-correct "reaper").
    await this.pool.query(`DELETE FROM public.auth_challenges WHERE tenant_id = $1 AND expires_at <= now()`, [
      challenge.tenantId,
    ]);
    await this.pool.query(
      `INSERT INTO public.auth_challenges
         (id, tenant_id, kind, user_id, credential_id, must_change_password, attempts, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, to_timestamp($7 / 1000.0), now())`,
      [challenge.id, challenge.tenantId, challenge.kind, challenge.userId, challenge.credentialId, challenge.mustChangePassword, challenge.expiresAt],
    );
    return challenge;
  }

  /**
   * Look up a LIVE challenge of the given kind. Returns null for unknown, wrong-kind, or expired
   * ids — so a caller can never tell "wrong id" from "expired id", and a guessed id is useless.
   * Expired rows are treated as expired without being deleted here; `issue()` reclaims them.
   */
  async get(tenantId: string, id: string | undefined | null, kind: ChallengeKind): Promise<AuthChallenge | null> {
    if (!id) return null;
    if (!this.pool) {
      const c = this.challenges.get(key(tenantId, id));
      if (!c || c.kind !== kind || c.expiresAt <= Date.now()) return null;
      return { ...c };
    }
    const { rows } = await this.pool.query<{
      id: string;
      kind: ChallengeKind;
      tenant_id: string;
      user_id: string;
      credential_id: string;
      must_change_password: boolean;
      attempts: number;
      expires_at: string;
    }>(
      `SELECT id, kind, tenant_id, user_id, credential_id, must_change_password, attempts,
              (extract(epoch from expires_at) * 1000)::bigint AS expires_at
         FROM public.auth_challenges WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    const r = rows[0];
    if (!r) return null;
    const challenge = this.fromRow(r);
    if (challenge.kind !== kind || challenge.expiresAt <= Date.now()) return null;
    return challenge;
  }

  /**
   * Count a wrong answer atomically, destroying the challenge once it is exhausted so a six-digit
   * code cannot be brute-forced against one long-lived challenge. Returns whether it survives.
   */
  async recordAttempt(tenantId: string, id: string): Promise<boolean> {
    if (!this.pool) {
      const c = this.challenges.get(key(tenantId, id));
      if (!c) return false;
      c.attempts += 1;
      if (c.attempts >= MAX_ATTEMPTS) {
        this.challenges.delete(key(tenantId, id));
        this.logger.warn(`challenge for ${c.userId} destroyed after ${c.attempts} failed attempts`);
        return false;
      }
      return true;
    }
    const { rows } = await this.pool.query<{ attempts: number; user_id: string }>(
      `UPDATE public.auth_challenges SET attempts = attempts + 1
         WHERE tenant_id = $1 AND id = $2 AND expires_at > now() RETURNING attempts, user_id`,
      [tenantId, id],
    );
    const r = rows[0];
    if (!r) return false;
    if (r.attempts >= MAX_ATTEMPTS) {
      await this.pool.query(`DELETE FROM public.auth_challenges WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
      this.logger.warn(`challenge for ${r.user_id} destroyed after ${r.attempts} failed attempts`);
      return false;
    }
    return true;
  }

  /**
   * Single-use, ATOMIC consume — gated on tenant + id + KIND + not-expired. Returns true only for
   * the caller that actually claimed the challenge; a concurrent second caller, a replay of an
   * already-used id, a wrong-kind presentation, or an expired challenge all get false. This is the
   * gate that makes "two concurrent correct codes ⇒ one session" hold by construction rather than
   * by a racy check-then-delete.
   */
  async consume(tenantId: string, id: string, kind: ChallengeKind): Promise<boolean> {
    if (!this.pool) {
      const c = this.challenges.get(key(tenantId, id));
      if (!c || c.kind !== kind || c.expiresAt <= Date.now()) {
        if (c && c.expiresAt <= Date.now()) this.challenges.delete(key(tenantId, id));
        return false;
      }
      return this.challenges.delete(key(tenantId, id));
    }
    const { rows } = await this.pool.query<{ id: string }>(
      `DELETE FROM public.auth_challenges
         WHERE tenant_id = $1 AND id = $2 AND kind = $3 AND expires_at > now() RETURNING id`,
      [tenantId, id, kind],
    );
    return rows.length > 0;
  }

  private fromRow(r: {
    id: string;
    kind: ChallengeKind;
    tenant_id: string;
    user_id: string;
    credential_id: string;
    must_change_password: boolean;
    attempts: number;
    expires_at: string;
  }): AuthChallenge {
    return {
      id: r.id,
      kind: r.kind,
      tenantId: r.tenant_id,
      userId: r.user_id,
      credentialId: r.credential_id,
      mustChangePassword: r.must_change_password,
      attempts: r.attempts,
      expiresAt: Number(r.expires_at),
    };
  }

  /** In-memory space reclamation for one tenant (mirrors the per-tenant DELETE on the pool path). */
  private sweepMemory(tenantId: string, now: number = Date.now()): void {
    for (const [k, challenge] of this.challenges) {
      if (challenge.tenantId === tenantId && challenge.expiresAt <= now) this.challenges.delete(k);
    }
  }

  /**
   * Drop every outstanding challenge for a principal. A challenge is pre-authentication state:
   * it names an account and, once answered, mints a session. Leaving one behind for a deprovisioned
   * user is leaving a half-open door — the identity is gone but the exchange that creates a session
   * for it is not.
   */
  async purgeForUser(tenantId: string, userId: string): Promise<number> {
    if (!this.pool) {
      let n = 0;
      for (const [id, c] of this.challenges.entries()) {
        if (c.tenantId === tenantId && c.userId === userId) {
          this.challenges.delete(id);
          n++;
        }
      }
      return n;
    }
    const res = await this.pool.query(
      `DELETE FROM public.auth_challenges WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    return res.rowCount ?? 0;
  }
}
