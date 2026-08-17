import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Pool } from 'pg';
import { dummyVerify, hashPassword, validatePassword, verifyPassword } from '@aura/shared';
import { PG_POOL } from '../events/pg-pool';
import { DEFAULT_THROTTLE, type ThrottleConfig } from './login-throttle';

// Local-account credentials (migration 0233 `auth_credentials`) — the store behind
// `POST /auth/login`.
//
// Before this existed, login compared the submitted password to a single deployment-wide
// `AUTH_DEV_PASSWORD` env var, accepted ANY password when that var was unset, and defaulted
// the username to `u-admin`. There was no per-user credential anywhere in the platform.
//
// Two deliberate design points:
//
// 1. NO in-memory hydrate when Postgres is configured — every check reads through. A
//    password change or a lockout on one node must be visible on every node immediately;
//    login is not a hot path, so one primary-key lookup per attempt is the right trade.
//    Without a pool it keeps an in-memory map, so dev and the in-memory E2E API work.
//
// 2. `authenticate` is the ONLY way to check a password, and it owns the lockout. The
//    caller cannot verify a password without the failure being counted, and cannot count
//    a failure without the lock being applied — the two can't drift apart.

/**
 * A credential that has verified. Deliberately small: this service proves a password and
 * nothing else. It does not know whether MFA is required, does not resolve tenant/company/
 * project context, and never issues a session or token — those belong to MfaService, the
 * authorization-context resolver, and SessionService respectively.
 */
export interface VerifiedCredential {
  userId: string;
  credentialId: string;
  mustChangePassword: boolean;
}

/**
 * Why a password check failed. **Internal to the auth layer** — consumed by
 * `AuthenticationService` for audit and telemetry, and collapsed there into a single
 * opaque result before anything reaches an HTTP boundary. It must never be returned.
 */
export type CredentialFailure = 'no-credential' | 'bad-password' | 'locked' | 'disabled';

export type CredentialVerification =
  | { ok: true; credential: VerifiedCredential }
  | { ok: false; reason: CredentialFailure; retryAfterMs?: number };

export type CredentialStatus = 'active' | 'must_change' | 'disabled';

export interface CredentialRecord {
  userId: string;
  status: CredentialStatus;
  passwordChangedAt: Date | null;
  failedAttempts: number;
  lockedUntil: Date | null;
}

interface StoredCredential {
  credentialId: string;
  passwordHash: string;
  status: CredentialStatus;
  passwordChangedAt: Date;
  failedAttempts: number;
  lastFailedAt: Date | null;
  lockedUntil: Date | null;
}

const key = (tenantId: string, userId: string): string => `${tenantId} ${userId}`;

function throttleConfig(env: NodeJS.ProcessEnv = process.env): ThrottleConfig {
  const num = (v: string | undefined, d: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    maxAttempts: num(env.AUTH_LOCKOUT_MAX, DEFAULT_THROTTLE.maxAttempts),
    windowMs: num(env.AUTH_LOCKOUT_WINDOW_MS, DEFAULT_THROTTLE.windowMs),
    lockMs: num(env.AUTH_LOCKOUT_MS, DEFAULT_THROTTLE.lockMs),
  };
}

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger('Credentials');
  private readonly local = new Map<string, StoredCredential>();

  constructor(@Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null) {}

  /**
   * Verify a password and apply the lockout, atomically from the caller's point of view.
   *
   * Always burns a hash's worth of CPU — including for an account that does not exist —
   * so the endpoint cannot be used to enumerate users by timing.
   *
   * The `reason` on a failure is for the auth layer's audit trail only. Collapse it before
   * it reaches a response: see `AuthenticationService`.
   */
  async verifyPasswordFor(tenantId: string, userId: string, plain: string): Promise<CredentialVerification> {
    const cfg = throttleConfig();
    const now = new Date();
    const row = await this.row(tenantId, userId);

    if (!row) {
      // No account / no credential: spend the same time as a real check.
      await dummyVerify();
      return { ok: false, reason: 'no-credential' };
    }
    if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
      return { ok: false, reason: 'locked', retryAfterMs: row.lockedUntil.getTime() - now.getTime() };
    }
    if (row.status === 'disabled') {
      await dummyVerify();
      return { ok: false, reason: 'disabled' };
    }

    if (!(await verifyPassword(plain, row.passwordHash))) {
      return this.recordFailure(tenantId, userId, row, cfg, now);
    }
    await this.resetFailures(tenantId, userId, row);
    return {
      ok: true,
      credential: {
        userId,
        credentialId: row.credentialId,
        mustChangePassword: row.status === 'must_change',
      },
    };
  }

  /**
   * Count a failed *second-factor* attempt against the same lockout as a bad password.
   * Without this the TOTP step is an unlimited-guess six-digit space, reachable by anyone
   * who already has the password. Separate entry point rather than a fake `authenticate`
   * call, so the intent is legible in the audit trail and no bogus password is hashed.
   */
  async recordMfaFailure(tenantId: string, userId: string): Promise<void> {
    const row = await this.row(tenantId, userId);
    if (!row) return;
    await this.recordFailure(tenantId, userId, row, throttleConfig(), new Date());
  }

  /** Does this account have a credential on file? */
  async has(tenantId: string, userId: string): Promise<boolean> {
    return (await this.row(tenantId, userId)) !== null;
  }

  /** Credential metadata for the admin security screen — never the hash. */
  async describe(tenantId: string, userId: string): Promise<CredentialRecord | null> {
    const row = await this.row(tenantId, userId);
    if (!row) return null;
    return {
      userId,
      status: row.status,
      passwordChangedAt: row.passwordChangedAt,
      failedAttempts: row.failedAttempts,
      lockedUntil: row.lockedUntil,
    };
  }

  /**
   * Set (or replace) an account's password, clearing any lockout. Enforces the length
   * policy — throws the reason as an Error, which the controller turns into a 400.
   *
   * `mustChange` marks the credential so the next successful login tells the client to
   * force a change: the path for admin-set and bootstrap passwords.
   */
  async setPassword(
    tenantId: string,
    userId: string,
    plain: string,
    opts: { mustChange?: boolean } = {},
  ): Promise<void> {
    const problem = validatePassword(plain);
    if (problem) throw new Error(problem);
    const passwordHash = await hashPassword(plain);
    const status: CredentialStatus = opts.mustChange ? 'must_change' : 'active';

    if (!this.pool) {
      this.local.set(key(tenantId, userId), {
        // A rotated credential is a NEW credential, so it gets a new id — matching the
        // database default rather than reusing the previous one.
        credentialId: randomUUID(),
        passwordHash,
        status,
        passwordChangedAt: new Date(),
        failedAttempts: 0,
        lastFailedAt: null,
        lockedUntil: null,
      });
      return;
    }
    await this.pool.query(
      `INSERT INTO public.auth_credentials
         (tenant_id, user_id, password_hash, status, password_changed_at, failed_attempts, last_failed_at, locked_until, updated_at)
       VALUES ($1, $2, $3, $4, now(), 0, NULL, NULL, now())
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         password_hash = excluded.password_hash, status = excluded.status,
         password_changed_at = now(), failed_attempts = 0, last_failed_at = NULL,
         locked_until = NULL, updated_at = now()`,
      [tenantId, userId, passwordHash, status],
    );
  }

  /** Suspend or re-enable password login without touching the stored hash. */
  async setStatus(tenantId: string, userId: string, status: CredentialStatus): Promise<boolean> {
    if (!this.pool) {
      const row = this.local.get(key(tenantId, userId));
      if (!row) return false;
      row.status = status;
      return true;
    }
    const res = await this.pool.query(
      `UPDATE public.auth_credentials SET status = $3, updated_at = now()
        WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId, status],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Clear a lockout early (admin unlock). */
  async unlock(tenantId: string, userId: string): Promise<boolean> {
    if (!this.pool) {
      const row = this.local.get(key(tenantId, userId));
      if (!row) return false;
      row.failedAttempts = 0;
      row.lockedUntil = null;
      return true;
    }
    const res = await this.pool.query(
      `UPDATE public.auth_credentials SET failed_attempts = 0, locked_until = NULL, updated_at = now()
        WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Remove an account's credential — it can no longer sign in with a password. */
  async clear(tenantId: string, userId: string): Promise<boolean> {
    if (!this.pool) return this.local.delete(key(tenantId, userId));
    const res = await this.pool.query(
      `DELETE FROM public.auth_credentials WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Every account in a tenant with a credential (admin security screen) — never hashes. */
  async list(tenantId: string): Promise<CredentialRecord[]> {
    if (!this.pool) {
      return [...this.local.entries()]
        .filter(([k]) => k.startsWith(`${tenantId} `))
        .map(([k, r]) => ({
          userId: k.slice(tenantId.length + 1),
          status: r.status,
          passwordChangedAt: r.passwordChangedAt,
          failedAttempts: r.failedAttempts,
          lockedUntil: r.lockedUntil,
        }))
        .sort((a, b) => a.userId.localeCompare(b.userId));
    }
    const { rows } = await this.pool.query<{
      userId: string;
      status: CredentialStatus;
      passwordChangedAt: Date;
      failedAttempts: number;
      lockedUntil: Date | null;
    }>(
      `SELECT user_id as "userId", status, password_changed_at as "passwordChangedAt",
              failed_attempts as "failedAttempts", locked_until as "lockedUntil"
         FROM public.auth_credentials WHERE tenant_id = $1 ORDER BY user_id`,
      [tenantId],
    );
    return rows;
  }

  /** Count the failure, locking the account once it crosses the threshold. */
  private async recordFailure(
    tenantId: string,
    userId: string,
    row: StoredCredential,
    cfg: ThrottleConfig,
    now: Date,
  ): Promise<{ ok: false; reason: CredentialFailure; retryAfterMs?: number }> {
    // Failures older than the window don't accumulate — a legitimate typo last month
    // must not combine with one today to lock a real user out.
    const withinWindow =
      row.lastFailedAt !== null && now.getTime() - row.lastFailedAt.getTime() <= cfg.windowMs;
    const attempts = (withinWindow ? row.failedAttempts : 0) + 1;
    const lockedUntil = attempts >= cfg.maxAttempts ? new Date(now.getTime() + cfg.lockMs) : null;

    if (!this.pool) {
      row.failedAttempts = attempts;
      row.lastFailedAt = now;
      row.lockedUntil = lockedUntil;
    } else {
      await this.pool
        .query(
          `UPDATE public.auth_credentials
              SET failed_attempts = $3, last_failed_at = $4, locked_until = $5, updated_at = now()
            WHERE tenant_id = $1 AND user_id = $2`,
          [tenantId, userId, attempts, now, lockedUntil],
        )
        .catch((err) => this.logger.error(`lockout update for ${userId} failed: ${(err as Error).message}`));
    }
    if (lockedUntil) {
      this.logger.warn(`account ${userId}@${tenantId} locked until ${lockedUntil.toISOString()} after ${attempts} failed attempts`);
      return { ok: false, reason: 'locked', retryAfterMs: lockedUntil.getTime() - now.getTime() };
    }
    return { ok: false, reason: 'bad-password' };
  }

  /** A successful login clears the counter. */
  private async resetFailures(tenantId: string, userId: string, row: StoredCredential): Promise<void> {
    if (row.failedAttempts === 0 && row.lockedUntil === null) return;
    if (!this.pool) {
      row.failedAttempts = 0;
      row.lastFailedAt = null;
      row.lockedUntil = null;
      return;
    }
    await this.pool
      .query(
        `UPDATE public.auth_credentials
            SET failed_attempts = 0, last_failed_at = NULL, locked_until = NULL, updated_at = now()
          WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, userId],
      )
      .catch((err) => this.logger.error(`failure reset for ${userId} failed: ${(err as Error).message}`));
  }

  private async row(tenantId: string, userId: string): Promise<StoredCredential | null> {
    if (!this.pool) return this.local.get(key(tenantId, userId)) ?? null;
    try {
      const { rows } = await this.pool.query<StoredCredential>(
        `SELECT credential_id as "credentialId", password_hash as "passwordHash", status,
                password_changed_at as "passwordChangedAt", failed_attempts as "failedAttempts",
                last_failed_at as "lastFailedAt", locked_until as "lockedUntil"
           FROM public.auth_credentials WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, userId],
      );
      return rows[0] ?? null;
    } catch (err) {
      // Fail CLOSED: a database blip must refuse the login, never wave it through.
      this.logger.error(`credential lookup for ${userId} failed: ${(err as Error).message}`);
      return null;
    }
  }
}
