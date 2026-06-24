import type { Pool, PoolClient } from 'pg';
import type { DomainEvent } from '@aura/shared';
import type { EventFilter, EventStore } from './event-store';

/** Column list shared by the store's reads and the outbox relay. */
export const EVENT_COLUMNS =
  'id, type, tenant_id, company_id, aggregate_type, aggregate_id, actor_id, occurred_at, version, payload';

/** Raw `aura_events` row (snake_case, pg-native types). */
export interface EventRow {
  id: string;
  type: string;
  tenant_id: string;
  company_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  actor_id: string | null;
  occurred_at: Date | string;
  version: number;
  payload: Record<string, unknown> | null;
}

/** Map a DB row back to the canonical DomainEvent. */
export function rowToEvent(r: EventRow): DomainEvent {
  return {
    id: r.id,
    type: r.type,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    aggregateType: r.aggregate_type,
    aggregateId: r.aggregate_id,
    actorId: r.actor_id,
    occurredAt: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : String(r.occurred_at),
    version: r.version,
    payload: r.payload ?? {},
  };
}

/**
 * Durable event ledger on Postgres (`aura_events`). Appends are the SOURCE side of
 * the transactional outbox: rows land with processed_at = NULL and the OutboxRelay
 * drains them to the bus — never a lost or phantom event. `appendWithClient` lets a
 * module write its business rows and the event in ONE caller-owned transaction,
 * which is the whole reason this needs a direct pg connection (not REST).
 */
export class PostgresEventStore implements EventStore {
  constructor(private readonly pool: Pool) {}

  async append(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.appendWithClient(client, events);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Insert events on a caller-supplied transaction — the atomic-outbox entry point. */
  async appendWithClient(client: PoolClient, events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    const params: unknown[] = [];
    const tuples = events.map((e, i) => {
      const b = i * 10;
      params.push(
        e.id,
        e.type,
        e.tenantId,
        e.companyId,
        e.aggregateType,
        e.aggregateId,
        e.actorId,
        e.occurredAt,
        e.version,
        JSON.stringify(e.payload ?? {}),
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`;
    });
    await client.query(
      `INSERT INTO public.aura_events (${EVENT_COLUMNS}) VALUES ${tuples.join(',')} ON CONFLICT (id) DO NOTHING`,
      params,
    );
  }

  async list(filter: EventFilter = {}): Promise<DomainEvent[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.tenantId) {
      params.push(filter.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    if (filter.type) {
      params.push(filter.type);
      where.push(`type = $${params.length}`);
    }
    if (filter.aggregateId) {
      params.push(filter.aggregateId);
      where.push(`aggregate_id = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const { rows } = await this.pool.query<EventRow>(
      `SELECT ${EVENT_COLUMNS} FROM public.aura_events ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    // Newest-N from the DB, returned oldest→newest to match the in-memory store.
    return rows.map(rowToEvent).reverse();
  }
}
