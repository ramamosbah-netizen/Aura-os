import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { MAIL_STORE, type MailStore } from '../mail/mail-store';
import { retryDelayMs } from '../mail/mail-dispatch.worker';
import { WhatsAppCloudProvider } from './whatsapp-cloud.provider';
import { WHATSAPP_STORE, type WhatsAppStore } from './whatsapp-store';

const POLL_MS = 10_000;
const BATCH = 20;
export const WHATSAPP_MAX_ATTEMPTS = 5;

/**
 * Recovers outbound WhatsApp messages that were persisted before the API process stopped.
 * The request path still attempts delivery immediately for a fast UX; this worker owns the
 * durable retry path and is the only code that can turn a previously queued message into a
 * terminal failed state after the request has gone away.
 */
@Injectable()
export class WhatsAppDispatchWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('WhatsAppDispatch');
  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(
    @Inject(MAIL_STORE) private readonly dispatch: MailStore,
    @Inject(WHATSAPP_STORE) private readonly store: WhatsAppStore,
    private readonly provider: WhatsAppCloudProvider,
    private readonly tenant: TenantContext,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.drain(), POLL_MS);
    this.timer.unref();
    this.logger.log(`WhatsApp dispatch worker started — draining every ${POLL_MS}ms.`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async drain(now = new Date().toISOString()): Promise<{ sent: number; failed: number }> {
    if (!this.provider.isConfigured()) return { sent: 0, failed: 0 };
    if (this.draining) return { sent: 0, failed: 0 };
    this.draining = true;
    const totals = { sent: 0, failed: 0 };
    try {
      const tenants = await this.dispatch.listTenantsWithMailbox();
      for (const tenantId of tenants) {
        const result = await this.tenant.run(
          { tenantId, companyId: null, actorId: 'system' },
          () => this.drainTenant(tenantId, now),
        );
        totals.sent += result.sent;
        totals.failed += result.failed;
      }
    } catch (error) {
      this.logger.error(`WhatsApp dispatch drain failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      this.draining = false;
    }
    return totals;
  }

  private async drainTenant(tenantId: string, now: string): Promise<{ sent: number; failed: number }> {
    const claimed = await this.dispatch.claimDueDispatch(tenantId, now, BATCH, 'whatsapp');
    let sent = 0;
    let failed = 0;
    for (const item of claimed) {
      if (await this.deliver(tenantId, item)) sent += 1;
      else failed += 1;
    }
    return { sent, failed };
  }

  private async deliver(tenantId: string, item: Awaited<ReturnType<MailStore['claimDueDispatch']>>[number]): Promise<boolean> {
    const message = await this.store.getMessage(tenantId, item.subjectId);
    if (!message || message.direction !== 'outbound' || message.status !== 'queued') {
      await this.dispatch.completeDispatch(tenantId, item.id, new Date().toISOString());
      return false;
    }

    try {
      const thread = await this.store.findThread(tenantId, message.threadId);
      if (!thread?.phone) throw new Error('WhatsApp conversation no longer exists');
      const result = await this.provider.sendText(thread.phone, message.body);
      if (result.status !== 'sent' || !result.externalMessageId) throw new Error(result.error ?? 'WhatsApp API rejected the message');
      await this.store.setMessageDelivery(tenantId, message.id, result.externalMessageId, 'sent', null);
      await this.dispatch.completeDispatch(tenantId, item.id, new Date().toISOString());
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'WhatsApp send failed';
      const attempts = item.attempts + 1;
      const giveUp = attempts >= WHATSAPP_MAX_ATTEMPTS;
      const retryAt = giveUp ? null : new Date(Date.now() + retryDelayMs(attempts)).toISOString();
      await this.dispatch.failDispatch(tenantId, item.id, reason, retryAt);
      await this.store.setMessageDelivery(tenantId, message.id, null, giveUp ? 'failed' : 'queued', giveUp ? reason : reason);
      if (giveUp) this.logger.error(`WhatsApp message ${message.id} dead-lettered after ${attempts} attempt(s): ${reason}`);
      else this.logger.warn(`WhatsApp message ${message.id} attempt ${attempts} failed, retrying at ${retryAt}: ${reason}`);
      return false;
    }
  }
}
