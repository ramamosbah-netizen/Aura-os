import type { Pool } from 'pg';
import type { WorkspaceConfig } from '@aura/shared';

/** DI token for the workspace-config store. */
export const WORKSPACE_CONFIG_STORE = Symbol('WORKSPACE_CONFIG_STORE');

/**
 * Persistence for the per-tenant workspace access configuration. One JSON
 * document per tenant. Postgres in production; in-memory stand-in for no-DB
 * boots — mirrors the platform's store pattern (SavedView, etc.).
 */
export interface WorkspaceConfigStore {
  get(tenantId: string): Promise<WorkspaceConfig | null>;
  save(tenantId: string, config: WorkspaceConfig): Promise<void>;
}

export class InMemoryWorkspaceConfigStore implements WorkspaceConfigStore {
  private readonly byTenant = new Map<string, WorkspaceConfig>();

  async get(tenantId: string): Promise<WorkspaceConfig | null> {
    const c = this.byTenant.get(tenantId);
    return c ? structuredClone(c) : null;
  }

  async save(tenantId: string, config: WorkspaceConfig): Promise<void> {
    this.byTenant.set(tenantId, structuredClone(config));
  }
}

interface Row {
  config: WorkspaceConfig;
}

/** Durable workspace config on Postgres (`aura_workspace_config`, one JSONB row per tenant). */
export class PostgresWorkspaceConfigStore implements WorkspaceConfigStore {
  constructor(private readonly pool: Pool) {}

  async get(tenantId: string): Promise<WorkspaceConfig | null> {
    const res = await this.pool.query<Row>(
      'SELECT config FROM public.aura_workspace_config WHERE tenant_id = $1',
      [tenantId],
    );
    return res.rows.length ? res.rows[0].config : null;
  }

  async save(tenantId: string, config: WorkspaceConfig): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_workspace_config (tenant_id, config, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (tenant_id) DO UPDATE SET config = EXCLUDED.config, updated_at = now()`,
      [tenantId, JSON.stringify(config)],
    );
  }
}
