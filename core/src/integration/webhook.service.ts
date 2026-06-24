import { Inject, Injectable } from '@nestjs/common';
import { type Id, type NewWebhookSubscription, type WebhookSubscription, makeWebhookSubscription } from '@aura/shared';
import { WEBHOOK_STORE, type WebhookDelivery, type WebhookStore } from './webhook-store';

/**
 * Kernel integration facade. Modules / admins register webhook subscriptions and
 * read the delivery log; the WebhookDispatcher does the actual sending off the bus.
 */
@Injectable()
export class WebhookService {
  constructor(@Inject(WEBHOOK_STORE) private readonly store: WebhookStore) {}

  async register(input: NewWebhookSubscription): Promise<WebhookSubscription> {
    const sub = makeWebhookSubscription(input);
    await this.store.saveSubscription(sub);
    return sub;
  }

  listSubscriptions(tenantId?: Id): Promise<WebhookSubscription[]> {
    return this.store.listSubscriptions(tenantId);
  }

  listDeliveries(subscriptionId?: Id, limit?: number): Promise<WebhookDelivery[]> {
    return this.store.listDeliveries(subscriptionId, limit);
  }
}
