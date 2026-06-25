import type { Id, WebhookSubscription } from '@aura/shared';

/** DI token for the webhook persistence store. */
export const WEBHOOK_STORE = Symbol('WEBHOOK_STORE');

export interface WebhookDelivery {
  id: Id;
  subscriptionId: Id;
  eventId: Id;
  eventType: string;
  url: string;
  /** pending = will be retried; success = delivered; dead = gave up after max attempts. */
  status: 'success' | 'pending' | 'dead' | 'failed';
  statusCode: number | null;
  error: string | null;
  /** POSTs made so far (1 = first try). */
  attempts: number;
  /** When the retry worker should next try (ISO), or null when terminal. */
  nextAttemptAt: string | null;
  /** The exact request body sent, so retries are self-contained (re-signed each send). */
  body: string;
  attemptedAt: string;
}

/**
 * Persistence for webhook subscriptions + a delivery audit log. Postgres impl in
 * production; in-memory stand-in so the API boots without a DB.
 */
export interface WebhookStore {
  saveSubscription(sub: WebhookSubscription): Promise<void>;
  getSubscription(id: Id): Promise<WebhookSubscription | null>;
  listSubscriptions(tenantId?: Id): Promise<WebhookSubscription[]>;
  /** All active subscriptions (every tenant) — the dispatcher filters by event tenant. */
  activeSubscriptions(): Promise<WebhookSubscription[]>;
  recordDelivery(delivery: WebhookDelivery): Promise<void>;
  updateDelivery(delivery: WebhookDelivery): Promise<void>;
  /** `pending` deliveries whose `nextAttemptAt` is due (<= nowIso) — the worker's claim. */
  duePendingDeliveries(nowIso: string, limit: number): Promise<WebhookDelivery[]>;
  listDeliveries(subscriptionId?: Id, limit?: number): Promise<WebhookDelivery[]>;
}
