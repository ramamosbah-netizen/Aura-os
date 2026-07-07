import { Controller, Get, Header, Inject, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL, metrics } from '@aura/core';

/**
 * Prometheus scrape endpoint (gap register Vol 23 #6). Counters are incremented by their
 * producers (jobs, webhook deliveries); point-in-time gauges (outbox lag, dead-letter depth)
 * are refreshed here from the outbox table at scrape time. Gated behind METRICS_ENABLED so it
 * is invisible unless an operator turns it on (a scraper hits it, not end users).
 */
@Controller('metrics')
export class MetricsController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {
    metrics.gauge('outbox_pending', 'Unprocessed outbox events (delivery lag).');
    metrics.gauge('outbox_dead_letter', 'Outbox events dead-lettered after max attempts.');
    metrics.counter('jobs_processed_total', 'Background jobs processed, by queue and outcome.');
    metrics.counter('webhook_deliveries_total', 'Outbound webhook delivery attempts, by outcome.');
  }

  @Get()
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(): Promise<string> {
    if (process.env.METRICS_ENABLED !== 'true') throw new NotFoundException();

    if (this.pool) {
      const count = async (where: string): Promise<number | null> => {
        try {
          const r = await this.pool!.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM public.aura_events WHERE ${where}`);
          return Number(r.rows[0]?.c ?? 0);
        } catch {
          return null; // never let a metrics scrape 500 the endpoint
        }
      };
      const pending = await count('processed_at IS NULL');
      if (pending !== null) metrics.set('outbox_pending', pending);
      const dead = await count('processed_at IS NOT NULL AND processing_error IS NOT NULL');
      if (dead !== null) metrics.set('outbox_dead_letter', dead);
    }

    return metrics.render();
  }
}
