import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import type { Pool } from 'pg';
import { GATEABLE_MODULE_IDS, MODULES_DISABLED_KEY, parseDisabledModules } from '@aura/shared';
import { PG_POOL } from '../events/pg-pool';
import { SettingsService } from './settings.service';

// Module Manager (Admin Center — NEW-ERP parity). Which business modules are enabled
// per tenant. The disabled set lives in the tenant settings row `modules.disabled`
// (csv — no new table); this service hydrates it on boot and keeps it in memory so the
// PermissionsGuard's per-request check is sync. Toggles write through the settings
// service (durable + visible in /admin/settings) and update memory immediately.

@Injectable()
export class ModulesService implements OnModuleInit {
  private readonly logger = new Logger('Modules');
  private readonly disabled = new Map<string, Set<string>>();

  constructor(
    @Optional() @Inject(PG_POOL) private readonly pool: Pool | null = null,
    // Explicit token: union-typed params emit Object in design:paramtypes (see auth.service).
    @Optional() @Inject(SettingsService) private readonly settings: SettingsService | null = null,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.pool) return;
    try {
      const { rows } = await this.pool.query<{ tenant_id: string; value: string }>(
        `SELECT tenant_id, value FROM public.aura_tenant_settings WHERE key = $1`,
        [MODULES_DISABLED_KEY],
      );
      for (const r of rows) this.disabled.set(r.tenant_id, parseDisabledModules(r.value));
      const total = rows.reduce((n, r) => n + parseDisabledModules(r.value).size, 0);
      if (total > 0) this.logger.log(`Hydrated module gates: ${total} disabled module(s) across ${rows.length} tenant(s)`);
    } catch (err) {
      this.logger.error(`Module-gates hydrate failed: ${(err as Error).message}`);
    }
  }

  /** Sync hot-path check — unknown modules and kernel surfaces are always enabled. */
  isEnabled(tenantId: string, moduleId: string): boolean {
    if (!GATEABLE_MODULE_IDS.has(moduleId)) return true;
    return !this.disabled.get(tenantId)?.has(moduleId);
  }

  disabledIds(tenantId: string): string[] {
    return [...(this.disabled.get(tenantId) ?? [])].sort();
  }

  async setEnabled(tenantId: string, moduleId: string, enabled: boolean): Promise<string[]> {
    if (!GATEABLE_MODULE_IDS.has(moduleId)) throw new Error(`not a gateable module: ${moduleId}`);
    const set = new Set(this.disabled.get(tenantId) ?? []);
    if (enabled) set.delete(moduleId);
    else set.add(moduleId);
    this.disabled.set(tenantId, set);
    const csv = [...set].sort().join(',');
    await this.settings?.set(tenantId, MODULES_DISABLED_KEY, csv, 'Disabled business modules (Module Manager)');
    this.logger.log(`Module ${moduleId} ${enabled ? 'enabled' : 'DISABLED'} for ${tenantId} (disabled: ${csv || 'none'})`);
    return [...set].sort();
  }
}
