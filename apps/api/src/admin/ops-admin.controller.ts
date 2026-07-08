import { Controller, Get, Inject } from '@nestjs/common';
import { PG_POOL, Permissions, metrics } from '@aura/core';
import type { Pool } from 'pg';

/**
 * Operations / health dashboard (gap register Vol 23 #12 + #6). Surfaces the observability
 * metrics as JSON for the admin ops screen: point-in-time gauges (outbox lag, dead-letter,
 * refreshed here from the outbox table) plus the running counters (jobs, webhook deliveries).
 * Guarded by `admin.ops.view`.
 */
@Controller('admin/ops')
export class OpsAdminController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {}

  @Permissions('admin.ops.view')
  @Get()
  async overview(): Promise<{ metrics: ReturnType<typeof metrics.snapshot>; dbConnected: boolean; generatedAt: string }> {
    if (this.pool) {
      const count = async (where: string): Promise<number | null> => {
        try {
          const r = await this.pool!.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM public.aura_events WHERE ${where}`);
          return Number(r.rows[0]?.c ?? 0);
        } catch {
          return null;
        }
      };
      const pending = await count('processed_at IS NULL');
      if (pending !== null) metrics.set('outbox_pending', pending);
      const dead = await count('processed_at IS NOT NULL AND processing_error IS NOT NULL');
      if (dead !== null) metrics.set('outbox_dead_letter', dead);
    }
    return { metrics: metrics.snapshot(), dbConnected: this.pool !== null, generatedAt: new Date().toISOString() };
  }
}
