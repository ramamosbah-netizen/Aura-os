import { createHmac } from 'node:crypto';
import { type Id, newId } from '../domain/id';

// Framework-free integration model — outbound webhooks. The kernel turns its event
// stream into something external systems can subscribe to: a subscription matches
// event types and receives signed POSTs. The outbound half of the Integration Platform.

export interface WebhookSubscription {
  id: Id;
  tenantId: Id;
  /** Event-type patterns to match, e.g. ['workflow.*', 'dms.document.created']. */
  eventTypes: string[];
  url: string;
  /** Shared secret for HMAC-SHA256 request signing. */
  secret: string;
  active: boolean;
  createdAt: string;
}

export interface NewWebhookSubscription {
  tenantId: Id;
  eventTypes: string[];
  url: string;
  secret?: string;
  active?: boolean;
}

export function makeWebhookSubscription(input: NewWebhookSubscription): WebhookSubscription {
  return {
    id: newId(),
    tenantId: input.tenantId,
    eventTypes: input.eventTypes,
    url: input.url,
    secret: input.secret ?? newId().replace(/-/g, ''),
    active: input.active ?? true,
    createdAt: new Date().toISOString(),
  };
}

/** Does a subscription pattern match an event type? Same wildcard rules as the event taxonomy. */
export function eventTypeMatches(pattern: string, eventType: string): boolean {
  if (pattern === '*') return true;
  const p = pattern.split('.');
  const e = eventType.split('.');
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '*') {
      if (i === p.length - 1) return true; // trailing '*' matches the rest
      continue; //                            mid '*' matches one segment
    }
    if (p[i] !== e[i]) return false;
  }
  return p.length === e.length;
}

/** Is this subscription active and interested in the given event type? */
export function subscriptionMatches(sub: WebhookSubscription, eventType: string): boolean {
  return sub.active && sub.eventTypes.some((p) => eventTypeMatches(p, eventType));
}

/** HMAC-SHA256 signature of a payload string, formatted `sha256=<hex>` (GitHub-style). */
export function signPayload(secret: string, payload: string): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}
