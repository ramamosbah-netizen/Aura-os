import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type DomainEvent, newId, subscriptionMatches, webhookBackoffMs } from '@aura/shared';
import { EventBus } from '../events/event-bus';
import { WEBHOOK_STORE, type WebhookDelivery, type WebhookStore } from './webhook-store';
import { sendWebhook } from './webhook-send';

const MAX_ATTEMPTS = Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? 5);
const BACKOFF_MS = Number(process.env.WEBHOOK_BACKOFF_MS ?? 2000);

/**
 * The outbound Integration seam. It is simply another EventBus '*' subscriber — so
 * every event already flowing through the spine (via the outbox relay) becomes an
 * external webhook. Matches active subscriptions for the event's tenant, POSTs a
 * signed payload, and records every delivery attempt.
 */
@Injectable()
export class WebhookDispatcher implements OnModuleInit {
  private readonly logger = new Logger('Webhooks');

  constructor(
    private readonly bus: EventBus,
    @Inject(WEBHOOK_STORE) private readonly store: WebhookStore,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe('*', (event) => this.dispatch(event));
  }

  private async dispatch(event: DomainEvent): Promise<void> {
    const subs = (await this.store.activeSubscriptions()).filter(
      (s) => s.tenantId === event.tenantId && subscriptionMatches(s, event.type),
    );
    for (const sub of subs) {
      const body = JSON.stringify({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt,
        tenantId: event.tenantId,
        companyId: event.companyId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload,
      });
      const result = await sendWebhook(sub.url, sub.secret, body, event.type);
      const delivery: WebhookDelivery = {
        id: newId(),
        subscriptionId: sub.id,
        eventId: event.id,
        eventType: event.type,
        url: sub.url,
        status: 'success',
        statusCode: result.statusCode,
        error: result.error,
        attempts: 1,
        nextAttemptAt: null,
        body,
        attemptedAt: new Date().toISOString(),
      };
      if (!result.ok) {
        // Failed first try: hand off to the retry worker (re-send with backoff), or
        // dead-letter immediately when no retries are configured.
        if (MAX_ATTEMPTS <= 1) {
          delivery.status = 'dead';
        } else {
          delivery.status = 'pending';
          delivery.nextAttemptAt = new Date(Date.now() + webhookBackoffMs(1, BACKOFF_MS)).toISOString();
        }
      }
      await this.store.recordDelivery(delivery).catch((e) => this.logger.error('record delivery failed', e));
      this.logger.log(`${event.type} → ${sub.url} [${delivery.status}${delivery.statusCode ? ` ${delivery.statusCode}` : ''}]`);
    }
  }
}
