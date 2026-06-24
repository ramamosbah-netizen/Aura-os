import type { Id, WebhookSubscription } from '@aura/shared';

/** DI token for the webhook persistence store. */
export const WEBHOOK_STORE = Symbol('WEBHOOK_STORE');

export interface WebhookDelivery {
  id: Id;
  subscriptionId: Id;
  eventId: Id;
  eventType: string;
  url: string;
  status: 'success' | 'failed';
  statusCode: number | null;
  error: string | null;
  attemptedAt: string;
}

/**
 * Persistence for webhook subscriptions + a delivery audit log. Postgres impl in
 * production; in-memory stand-in so the API boots without a DB.
 */
export interface WebhookStore {
  saveSubscription(sub: WebhookSubscription): Promise<void>;
  listSubscriptions(tenantId?: Id): Promise<WebhookSubscription[]>;
  /** All active subscriptions (every tenant) — the dispatcher filters by event tenant. */
  activeSubscriptions(): Promise<WebhookSubscription[]>;
  recordDelivery(delivery: WebhookDelivery): Promise<void>;
  listDeliveries(subscriptionId?: Id, limit?: number): Promise<WebhookDelivery[]>;
}
