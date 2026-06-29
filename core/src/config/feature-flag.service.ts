import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../events/pg-pool';

export interface FlagRule {
  tenantId: string;
  enabled: boolean;
}

@Injectable()
export class FeatureFlagService {
  private readonly logger = new Logger('FeatureFlagService');
  private readonly localCache = new Map<string, { enabledDefault: boolean; rules: FlagRule[] }>();

  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {}

  async isEnabled(flagKey: string, tenantId: string): Promise<boolean> {
    if (!this.pool) {
      // In-memory local fallback mode
      const cached = this.localCache.get(flagKey);
      if (!cached) return false;
      const rule = cached.rules.find((r) => r.tenantId === tenantId);
      return rule ? rule.enabled : cached.enabledDefault;
    }

    const { rows } = await this.pool.query<{
      enabled_default: boolean;
      rules: any;
    }>(
      `SELECT enabled_default, rules FROM public.aura_feature_flags WHERE flag_key = $1`,
      [flagKey]
    );

    if (rows.length === 0) {
      return false;
    }

    const r = rows[0];
    const rules = (Array.isArray(r.rules) ? r.rules : []) as FlagRule[];
    const tenantRule = rules.find((rule) => rule.tenantId === tenantId);
    return tenantRule ? tenantRule.enabled : r.enabled_default;
  }

  async setFlag(
    flagKey: string,
    enabledDefault: boolean,
    rules: FlagRule[],
    description?: string
  ): Promise<void> {
    if (!this.pool) {
      this.localCache.set(flagKey, { enabledDefault, rules });
      return;
    }

    await this.pool.query(
      `INSERT INTO public.aura_feature_flags (flag_key, description, enabled_default, rules, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (flag_key)
       DO UPDATE SET enabled_default = EXCLUDED.enabled_default, rules = EXCLUDED.rules, updated_at = now()`,
      [flagKey, description || '', enabledDefault, JSON.stringify(rules)]
    );
    this.logger.log(`Feature flag "${flagKey}" set. Default: ${enabledDefault}. Overrides: ${rules.length}`);
  }
}
