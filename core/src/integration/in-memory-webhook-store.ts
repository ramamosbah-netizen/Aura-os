import type { Id, WebhookSubscription } from '@aura/shared';
import type { WebhookDelivery, WebhookStore } from './webhook-store';

/** In-memory webhook store — the boot-safe fallback when there's no DATABASE_URL. */
export class InMemoryWebhookStore implements WebhookStore {
  private readonly subs = new Map<Id, WebhookSubscription>();
  private readonly deliveries: WebhookDelivery[] = [];

  async saveSubscription(sub: WebhookSubscription): Promise<void> {
    this.subs.set(sub.id, sub);
  }

  async getSubscription(id: Id): Promise<WebhookSubscription | null> {
    return this.subs.get(id) ?? null;
  }

  async listSubscriptions(tenantId?: Id): Promise<WebhookSubscription[]> {
    const all = [...this.subs.values()];
    return tenantId ? all.filter((s) => s.tenantId === tenantId) : all;
  }

  async activeSubscriptions(): Promise<WebhookSubscription[]> {
    return [...this.subs.values()].filter((s) => s.active);
  }

  async recordDelivery(delivery: WebhookDelivery): Promise<void> {
    this.deliveries.push({ ...delivery });
  }

  async updateDelivery(delivery: WebhookDelivery): Promise<void> {
    const i = this.deliveries.findIndex((d) => d.id === delivery.id);
    if (i >= 0) this.deliveries[i] = { ...delivery };
    else this.deliveries.push({ ...delivery });
  }

  async duePendingDeliveries(nowIso: string, limit: number): Promise<WebhookDelivery[]> {
    return this.deliveries
      .filter((d) => d.status === 'pending' && d.nextAttemptAt !== null && d.nextAttemptAt <= nowIso)
      .sort((a, b) => ((a.nextAttemptAt ?? '') < (b.nextAttemptAt ?? '') ? -1 : 1))
      .slice(0, limit)
      .map((d) => ({ ...d }));
  }

  async listDeliveries(subscriptionId?: Id, limit = 50): Promise<WebhookDelivery[]> {
    let out = this.deliveries;
    if (subscriptionId) out = out.filter((d) => d.subscriptionId === subscriptionId);
    return out.slice(-limit).reverse();
  }
}
