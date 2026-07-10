import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Pool } from 'pg';
import { verifyTotp } from '@aura/shared';
import { PG_POOL } from '../events/pg-pool';

// Per-user MFA enrolment store (gap register Vol 23 #13). Two-step: `enroll` parks the
// TOTP secret inactive; `activate` verifies the user's first code and switches it on.
// Only *active* enrolments gate login. Postgres when configured, in-memory in dev —
// the SettingsService pattern.

interface MfaRow {
  secret: string;
  active: boolean;
}

@Injectable()
export class MfaService {
  private readonly logger = new Logger('MfaService');
  private readonly local = new Map<string, MfaRow>();

  constructor(@Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null) {}

  /** Park a (new) secret for the user, inactive until the first code verifies. */
  async enroll(userId: string, secret: string): Promise<void> {
    if (!this.pool) {
      this.local.set(userId, { secret, active: false });
      return;
    }
    await this.pool.query(
      `INSERT INTO public.aura_user_mfa (user_id, secret, active, enrolled_at)
       VALUES ($1, $2, false, now())
       ON CONFLICT (user_id) DO UPDATE SET secret = excluded.secret, active = false, enrolled_at = now(), activated_at = NULL`,
      [userId, secret],
    );
  }

  /** Verify the user's first code against the parked secret; on success MFA becomes active. */
  async activate(userId: string, code: string): Promise<boolean> {
    const row = await this.row(userId);
    if (!row || !verifyTotp(row.secret, code)) return false;
    if (!this.pool) {
      this.local.set(userId, { ...row, active: true });
    } else {
      await this.pool.query(`UPDATE public.aura_user_mfa SET active = true, activated_at = now() WHERE user_id = $1`, [userId]);
    }
    this.logger.log(`MFA activated for ${userId}`);
    return true;
  }

  /** The active TOTP secret for a user, or null when not enrolled/activated. */
  async activeSecret(userId: string): Promise<string | null> {
    const row = await this.row(userId);
    return row?.active ? row.secret : null;
  }

  /** All enrolments (admin security screen) — user + active/pending, never secrets. */
  async listEnrolments(): Promise<Array<{ userId: string; active: boolean }>> {
    if (!this.pool) {
      return [...this.local.entries()].map(([userId, r]) => ({ userId, active: r.active }));
    }
    const { rows } = await this.pool.query<{ userId: string; active: boolean }>(
      `SELECT user_id as "userId", active FROM public.aura_user_mfa ORDER BY user_id`,
    );
    return rows;
  }

  /** Remove the user's enrolment (admin reset / device loss). */
  async disable(userId: string): Promise<boolean> {
    if (!this.pool) return this.local.delete(userId);
    const res = await this.pool.query(`DELETE FROM public.aura_user_mfa WHERE user_id = $1`, [userId]);
    return (res.rowCount ?? 0) > 0;
  }

  private async row(userId: string): Promise<MfaRow | null> {
    if (!this.pool) return this.local.get(userId) ?? null;
    const { rows } = await this.pool.query<MfaRow>(`SELECT secret, active FROM public.aura_user_mfa WHERE user_id = $1`, [userId]);
    return rows[0] ?? null;
  }
}
