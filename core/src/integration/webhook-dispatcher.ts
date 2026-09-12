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
      // ALREADY SENT? (TC-GATE-22) This dispatcher subscribes to `*`, so it receives every event,
      // and the outbox relay retries the whole event whenever ANY handler in the fan-out throws.
      // Without this check a failure somewhere else in the system re-POSTs a business event to a
      // customer endpoint — the only duplicate here that leaves the building, and the only one the
      // people affected cannot see the cause of.
      //
      // The delivery table already recorded every send; nothing was reading it before the send.
      // A failed read means SEND: a webhook that arrives twice is recoverable, one that never
      // arrives because the log was unavailable is not. The retry worker owns re-sending a
      // delivery that failed, which is why this only skips ones already on file.
      const alreadySent = await this.store
        .deliveryExists(sub.id, event.id)
        .catch(() => false);
      if (alreadySent) {
        this.logger.log(`${event.type} → ${sub.url} [skipped: already delivered for this event]`);
        continue;
      }

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
