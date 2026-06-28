import type { DomainEvent } from '@aura/shared';
import type { TxHandle } from './tx';

export interface EventFilter {
  tenantId?: string;
  type?: string;
  aggregateId?: string;
  limit?: number;
}

/** An event the relay gave up on (dead-lettered after the retry cap). */
export interface DeadLetteredEvent {
  id: string;
  type: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  attempts: number;
  error: string | null;
  deadLetteredAt: string;
}

/**
 * Append-only ledger. Phase-0 impl is in-memory; the production impl writes the
 * Postgres `events` table inside the business transaction (transactional outbox)
 * and a relay drains it to the bus — at-least-once delivery, never a lost event.
 */
export interface EventStore {
  append(events: DomainEvent[]): Promise<void>;
  /** Append on a caller-owned transaction (atomic outbox); `null` tx falls back to `append`. */
  appendWithClient(tx: TxHandle | null, events: DomainEvent[]): Promise<void>;
  list(filter?: EventFilter): Promise<DomainEvent[]>;
  /** Events the relay dead-lettered after exhausting retries (empty without an outbox). */
  listDeadLettered(limit?: number): Promise<DeadLetteredEvent[]>;
}

/** DI token for the EventStore implementation. */
export const EVENT_STORE = Symbol('EVENT_STORE');
