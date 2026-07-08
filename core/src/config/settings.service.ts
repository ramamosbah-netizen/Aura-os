import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';

// Tenant settings (gap register Vol 23 #12 admin center). A generic per-tenant key/value store
// for organisation-level configuration that isn't its own subsystem — company name, default
// currency, fiscal-year start, invoice footer, etc. In-memory in dev; Postgres when configured.

export interface TenantSetting {
  key: string;
  value: string;
  description: string;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger('SettingsService');
  private readonly local = new Map<string, Map<string, { value: string; description: string }>>();

  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {}

  async get(tenantId: string, key: string): Promise<string | null> {
    if (!this.pool) return this.local.get(tenantId)?.get(key)?.value ?? null;
    const { rows } = await this.pool.query<{ value: string }>(
      `SELECT value FROM public.aura_tenant_settings WHERE tenant_id = $1 AND key = $2`,
      [tenantId, key],
    );
    return rows[0]?.value ?? null;
  }

  async list(tenantId: string): Promise<TenantSetting[]> {
    if (!this.pool) {
      const m = this.local.get(tenantId);
      return m ? [...m.entries()].map(([key, v]) => ({ key, value: v.value, description: v.description })) : [];
    }
    const { rows } = await this.pool.query<{ key: string; value: string; description: string }>(
      `SELECT key, value, description FROM public.aura_tenant_settings WHERE tenant_id = $1 ORDER BY key`,
      [tenantId],
    );
    return rows.map((r) => ({ key: r.key, value: r.value, description: r.description ?? '' }));
  }

  async set(tenantId: string, key: string, value: string, description = ''): Promise<void> {
    if (!this.pool) {
      const m = this.local.get(tenantId) ?? new Map<string, { value: string; description: string }>();
      m.set(key, { value, description });
      this.local.set(tenantId, m);
      return;
    }
    await this.pool.query(
      `INSERT INTO public.aura_tenant_settings (tenant_id, key, value, description, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (tenant_id, key) DO UPDATE SET value = excluded.value, description = excluded.description, updated_at = now()`,
      [tenantId, key, value, description],
    );
    this.logger.log(`[Settings] ${tenantId} · ${key} updated`);
  }

  async remove(tenantId: string, key: string): Promise<boolean> {
    if (!this.pool) {
      return this.local.get(tenantId)?.delete(key) ?? false;
    }
    const res = await this.pool.query(`DELETE FROM public.aura_tenant_settings WHERE tenant_id = $1 AND key = $2`, [tenantId, key]);
    return (res.rowCount ?? 0) > 0;
  }
}
