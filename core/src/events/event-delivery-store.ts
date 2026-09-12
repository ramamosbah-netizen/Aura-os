/**
 * Per-handler delivery log (TC-GATE-22).
 *
 * `EventBus.publish` fans an event out to every subscriber and the outbox relay retries the whole
 * EVENT, so one handler's failure re-runs its siblings — including the ones whose own comments say a
 * replay would double-post. The retry decision is written per handler at each call site; the retry
 * itself was not. This is what makes the two agree.
 *
 * A handler asks `wasDelivered` before doing its work and calls `markDelivered` after it succeeds.
 * Deliberately in that order, and deliberately not a single atomic "claim": claiming BEFORE the work
 * would mark a handler done that then failed, and the retry would skip the thing it exists to redo.
 *
 * The window between the two is the case where a handler ran and the process died before recording.
 * That is the same window the outbox itself has, it is bounded by the relay claiming each event
 * `FOR UPDATE SKIP LOCKED` (so two workers do not process one event at once), and it is why the
 * durable dedupe keys added in TC-GATE-20 stay in place. This layer removes the re-runs; the keys
 * survive the ones it cannot.
 */
export interface EventDelivery {
  id: string;
  tenantId: string;
  eventId: string;
  handler: string;
  deliveredAt: string;
}

export interface EventDeliveryStore {
  /** Has `handler` already completed `eventId` for this tenant? */
  wasDelivered(tenantId: string, eventId: string, handler: string): Promise<boolean>;

  /**
   * Record that it has. Safe to call twice — the unique index absorbs a repeat rather than raising,
   * so a racing relay cannot turn a successful side effect into a failed event.
   */
  markDelivered(tenantId: string, eventId: string, handler: string): Promise<void>;

  /** Every handler already recorded for one event. The relay's question, asked once. */
  deliveredHandlers(tenantId: string, eventId: string): Promise<string[]>;
}

export const EVENT_DELIVERY_STORE = Symbol('EVENT_DELIVERY_STORE');
