import type { Pool } from 'pg';
import { newId } from '@aura/shared';
import type { EventDeliveryStore } from './event-delivery-store';

/** Postgres adapter for the per-handler delivery log (TC-GATE-22). See the interface for why. */
export class PostgresEventDeliveryStore implements EventDeliveryStore {
  constructor(private readonly pool: Pool) {}

  async wasDelivered(tenantId: string, eventId: string, handler: string): Promise<boolean> {
    const res = await this.pool.query(
      `select 1 from public.aura_event_handler_deliveries
        where tenant_id = $1 and event_id = $2 and handler = $3 limit 1`,
      [tenantId, eventId, handler],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async markDelivered(tenantId: string, eventId: string, handler: string): Promise<void> {
    // ON CONFLICT DO NOTHING, not an error: a racing relay recording the same success must not turn
    // a side effect that HAPPENED into an event that failed.
    await this.pool.query(
      `insert into public.aura_event_handler_deliveries (id, tenant_id, event_id, handler)
       values ($1, $2, $3, $4)
       on conflict (tenant_id, event_id, handler) do nothing`,
      [newId(), tenantId, eventId, handler],
    );
  }

  async deliveredHandlers(tenantId: string, eventId: string): Promise<string[]> {
    const res = await this.pool.query<{ handler: string }>(
      `select handler from public.aura_event_handler_deliveries where tenant_id = $1 and event_id = $2`,
      [tenantId, eventId],
    );
    return res.rows.map((r) => r.handler);
  }
}
