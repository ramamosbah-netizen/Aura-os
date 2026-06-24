import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type DomainEvent, newId, signPayload, subscriptionMatches } from '@aura/shared';
import { EventBus } from '../events/event-bus';
import { WEBHOOK_STORE, type WebhookDelivery, type WebhookStore } from './webhook-store';

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
      const delivery: WebhookDelivery = {
        id: newId(),
        subscriptionId: sub.id,
        eventId: event.id,
        eventType: event.type,
        url: sub.url,
        status: 'success',
        statusCode: null,
        error: null,
        attemptedAt: new Date().toISOString(),
      };
      try {
        const res = await fetch(sub.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-aura-event': event.type,
            'x-aura-signature': signPayload(sub.secret, body),
          },
          body,
        });
        delivery.statusCode = res.status;
        delivery.status = res.ok ? 'success' : 'failed';
        if (!res.ok) delivery.error = `HTTP ${res.status}`;
      } catch (err) {
        delivery.status = 'failed';
        delivery.error = err instanceof Error ? err.message : String(err);
      }
      await this.store.recordDelivery(delivery).catch((e) => this.logger.error('record delivery failed', e));
      this.logger.log(`${event.type} → ${sub.url} [${delivery.status}${delivery.statusCode ? ` ${delivery.statusCode}` : ''}]`);
    }
  }
}
