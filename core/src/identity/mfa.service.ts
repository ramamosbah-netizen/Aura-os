import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Pool } from 'pg';
import { verifyTotp } from '@aura/shared';
import { PG_POOL } from '../events/pg-pool';

// Per-user MFA enrolment store (gap register Vol 23 #13). Two-step: `enroll` parks the
// TOTP secret inactive; `activate` verifies the user's first code and switches it on.
// Only *active* enrolments gate login. Postgres when configured, in-memory in dev —
// the SettingsService pattern.
//
// TENANT-SCOPED as of migration 0234. The table was keyed by `user_id` alone with no tenant
// column, so TOTP secrets had no tenant identity to isolate on and RLS could not be enabled
// on them at all. The same user id in two tenants is two different people — which is exactly
// what `aura_users`' composite primary key already says — so every operation here now takes
// the tenant and the RLS policy scopes it.

interface MfaRow {
  secret: string;
  active: boolean;
}

@Injectable()
export class MfaService {
  private readonly logger = new Logger('MfaService');
  private readonly local = new Map<string, MfaRow>();

  /** In-memory key mirrors the (tenant_id, user_id) primary key the table now carries. */
  private static key(tenantId: string, userId: string): string {
    return `${tenantId} ${userId}`;
  }

  constructor(@Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null) {}

  /** Park a (new) secret for the user, inactive until the first code verifies. */
  async enroll(tenantId: string, userId: string, secret: string): Promise<void> {
    if (!this.pool) {
      this.local.set(MfaService.key(tenantId, userId), { secret, active: false });
      return;
    }
    await this.pool.query(
      `INSERT INTO public.aura_user_mfa (tenant_id, user_id, secret, active, enrolled_at)
       VALUES ($1, $2, $3, false, now())
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET secret = excluded.secret, active = false, enrolled_at = now(), activated_at = NULL`,
      [tenantId, userId, secret],
    );
  }

  /** Verify the user's first code against the parked secret; on success MFA becomes active. */
  async activate(tenantId: string, userId: string, code: string): Promise<boolean> {
    const row = await this.row(tenantId, userId);
    if (!row || !verifyTotp(row.secret, code)) return false;
    if (!this.pool) {
      this.local.set(MfaService.key(tenantId, userId), { ...row, active: true });
    } else {
      await this.pool.query(
        `UPDATE public.aura_user_mfa SET active = true, activated_at = now() WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, userId],
      );
    }
    this.logger.log(`MFA activated for ${userId}@${tenantId}`);
    return true;
  }

  /** The active TOTP secret for a user, or null when not enrolled/activated. */
  async activeSecret(tenantId: string, userId: string): Promise<string | null> {
    const row = await this.row(tenantId, userId);
    return row?.active ? row.secret : null;
  }

  /** All enrolments (admin security screen) — user + active/pending, never secrets. */
  async listEnrolments(tenantId: string): Promise<Array<{ userId: string; active: boolean }>> {
    if (!this.pool) {
      const prefix = `${tenantId} `;
      return [...this.local.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, r]) => ({ userId: k.slice(prefix.length), active: r.active }));
    }
    const { rows } = await this.pool.query<{ userId: string; active: boolean }>(
      `SELECT user_id as "userId", active FROM public.aura_user_mfa WHERE tenant_id = $1 ORDER BY user_id`,
      [tenantId],
    );
    return rows;
  }

  /** Remove the user's enrolment (admin reset / device loss). */
  async disable(tenantId: string, userId: string): Promise<boolean> {
    if (!this.pool) return this.local.delete(MfaService.key(tenantId, userId));
    const res = await this.pool.query(
      `DELETE FROM public.aura_user_mfa WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  private async row(tenantId: string, userId: string): Promise<MfaRow | null> {
    if (!this.pool) return this.local.get(MfaService.key(tenantId, userId)) ?? null;
    const { rows } = await this.pool.query<MfaRow>(
      `SELECT secret, active FROM public.aura_user_mfa WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    return rows[0] ?? null;
  }
}
