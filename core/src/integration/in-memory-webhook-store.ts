import type { Id, WebhookSubscription } from '@aura/shared';
import type { WebhookDelivery, WebhookStore } from './webhook-store';

/** In-memory webhook store — the boot-safe fallback when there's no DATABASE_URL. */
export class InMemoryWebhookStore implements WebhookStore {
  private readonly subs = new Map<Id, WebhookSubscription>();
  private readonly deliveries: WebhookDelivery[] = [];

  async saveSubscription(sub: WebhookSubscription): Promise<void> {
    this.subs.set(sub.id, sub);
  }

  async listSubscriptions(tenantId?: Id): Promise<WebhookSubscription[]> {
    const all = [...this.subs.values()];
    return tenantId ? all.filter((s) => s.tenantId === tenantId) : all;
  }

  async activeSubscriptions(): Promise<WebhookSubscription[]> {
    return [...this.subs.values()].filter((s) => s.active);
  }

  async recordDelivery(delivery: WebhookDelivery): Promise<void> {
    this.deliveries.push(delivery);
  }

  async listDeliveries(subscriptionId?: Id, limit = 50): Promise<WebhookDelivery[]> {
    let out = this.deliveries;
    if (subscriptionId) out = out.filter((d) => d.subscriptionId === subscriptionId);
    return out.slice(-limit).reverse();
  }
}
