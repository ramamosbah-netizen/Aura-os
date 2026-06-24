import type { DomainEvent } from '@aura/shared';

export interface EventFilter {
  tenantId?: string;
  type?: string;
  aggregateId?: string;
  limit?: number;
}

/**
 * Append-only ledger. Phase-0 impl is in-memory; the production impl writes the
 * Postgres `events` table inside the business transaction (transactional outbox)
 * and a relay drains it to the bus — at-least-once delivery, never a lost event.
 */
export interface EventStore {
  append(events: DomainEvent[]): Promise<void>;
  list(filter?: EventFilter): Promise<DomainEvent[]>;
}

/** DI token for the EventStore implementation. */
export const EVENT_STORE = Symbol('EVENT_STORE');
