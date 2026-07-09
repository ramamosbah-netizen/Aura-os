import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Pool } from 'pg';
import type { FormOverrides } from '@aura/shared';
import { PG_POOL } from '../events/pg-pool';

// Form-override store (Form Designer P1, Vol 15 §2.4). Sparse per-tenant patches
// over code-registered form schemas — see @aura/shared applyFormOverrides.
// Postgres when configured, in-memory in dev (the SettingsService pattern).

@Injectable()
export class FormOverridesService {
  private readonly logger = new Logger('FormOverrides');
  private readonly local = new Map<string, Map<string, FormOverrides>>();

  constructor(@Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null) {}

  async get(tenantId: string, schemaId: string): Promise<FormOverrides | null> {
    if (!this.pool) return this.local.get(tenantId)?.get(schemaId) ?? null;
    const { rows } = await this.pool.query<{ overrides: FormOverrides }>(
      `SELECT overrides FROM public.aura_form_overrides WHERE tenant_id = $1 AND schema_id = $2`,
      [tenantId, schemaId],
    );
    return rows[0]?.overrides ?? null;
  }

  /** Every stored override patch for the tenant, keyed by schema id. */
  async list(tenantId: string): Promise<Record<string, FormOverrides>> {
    if (!this.pool) {
      return Object.fromEntries(this.local.get(tenantId)?.entries() ?? []);
    }
    const { rows } = await this.pool.query<{ schema_id: string; overrides: FormOverrides }>(
      `SELECT schema_id, overrides FROM public.aura_form_overrides WHERE tenant_id = $1`,
      [tenantId],
    );
    return Object.fromEntries(rows.map((r) => [r.schema_id, r.overrides]));
  }

  async set(tenantId: string, schemaId: string, overrides: FormOverrides): Promise<void> {
    if (!this.pool) {
      const m = this.local.get(tenantId) ?? new Map<string, FormOverrides>();
      m.set(schemaId, overrides);
      this.local.set(tenantId, m);
      return;
    }
    await this.pool.query(
      `INSERT INTO public.aura_form_overrides (tenant_id, schema_id, overrides, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (tenant_id, schema_id) DO UPDATE SET overrides = excluded.overrides, updated_at = now()`,
      [tenantId, schemaId, JSON.stringify(overrides)],
    );
    this.logger.log(`Form overrides saved: ${tenantId} · ${schemaId}`);
  }

  async remove(tenantId: string, schemaId: string): Promise<boolean> {
    if (!this.pool) return this.local.get(tenantId)?.delete(schemaId) ?? false;
    const res = await this.pool.query(
      `DELETE FROM public.aura_form_overrides WHERE tenant_id = $1 AND schema_id = $2`,
      [tenantId, schemaId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
