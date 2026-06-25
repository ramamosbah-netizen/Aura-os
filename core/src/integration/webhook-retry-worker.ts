import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { webhookBackoffMs } from '@aura/shared';
import { WEBHOOK_STORE, type WebhookStore } from './webhook-store';
import { sendWebhook } from './webhook-send';

const RETRY_MS = Number(process.env.WEBHOOK_RETRY_MS ?? 5000);
const MAX_ATTEMPTS = Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? 5);
const BACKOFF_MS = Number(process.env.WEBHOOK_BACKOFF_MS ?? 2000);
const BATCH = Number(process.env.WEBHOOK_RETRY_BATCH ?? 50);

/**
 * Redelivery worker for failed webhooks. Periodically claims `pending` deliveries whose
 * `nextAttemptAt` is due, re-POSTs the stored body, and either marks them `success`,
 * reschedules with exponential backoff, or `dead`-letters them after MAX_ATTEMPTS — so a
 * permanently-broken endpoint can't be retried forever (the poison-pill guard).
 */
@Injectable()
export class WebhookRetryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('WebhookRetry');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(@Inject(WEBHOOK_STORE) private readonly store: WebhookStore) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), RETRY_MS);
    this.timer.unref();
    this.logger.log(`Webhook retry worker started (every ${RETRY_MS}ms, max ${MAX_ATTEMPTS} attempts).`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Re-attempt one batch of due `pending` deliveries. Re-entrancy guarded by `running`. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.store.duePendingDeliveries(new Date().toISOString(), BATCH);
      for (const d of due) {
        const sub = await this.store.getSubscription(d.subscriptionId);
        d.attempts += 1;
        d.attemptedAt = new Date().toISOString();
        if (!sub || !sub.active) {
          d.status = 'dead';
          d.error = 'subscription missing or inactive';
          d.nextAttemptAt = null;
        } else {
          const r = await sendWebhook(sub.url, sub.secret, d.body, d.eventType);
          d.statusCode = r.statusCode;
          if (r.ok) {
            d.status = 'success';
            d.error = null;
            d.nextAttemptAt = null;
          } else if (d.attempts >= MAX_ATTEMPTS) {
            d.status = 'dead';
            d.error = r.error;
            d.nextAttemptAt = null;
          } else {
            d.status = 'pending';
            d.error = r.error;
            d.nextAttemptAt = new Date(Date.now() + webhookBackoffMs(d.attempts, BACKOFF_MS)).toISOString();
          }
        }
        await this.store.updateDelivery(d);
        this.logger.log(`retry ${d.eventType} → ${d.url} attempt ${d.attempts} [${d.status}]`);
      }
    } catch (err) {
      this.logger.error(`retry tick failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
