import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { AuraInternalMailAdapter } from './aura-internal-adapter';
import {
  MailProviderRegistry,
  PermanentDeliveryError,
  requireCapability,
  type MailAccountRef,
} from './mail-delivery';
import type { MailRecord } from './mail-domain';
import { MAIL_STORE, type DispatchRecord, type MailStore } from './mail-store';

/** How often to look for due work. */
const POLL_MS = 10_000;
/** How many messages one tenant may claim per tick — bounded so one busy tenant cannot starve others. */
const BATCH = 20;
/** Give up after this many attempts and dead-letter, rather than retrying a broken message forever. */
export const MAX_ATTEMPTS = 5;

/** Exponential backoff with a ceiling: 1m, 4m, 9m, 16m… so a flapping provider is not hammered. */
export function retryDelayMs(attempt: number): number {
  return Math.min(attempt * attempt * 60_000, 60 * 60_000);
}

/**
 * The outbound mail dispatch worker.
 *
 * It is the ONLY thing that may move a message queued → sending → sent | failed. A user asks to
 * send; this decides what actually happened. That split is what stops the UI claiming delivery
 * before anything tried to deliver.
 *
 * Built on the same shape as the outbox relay: claim with FOR UPDATE SKIP LOCKED, count attempts,
 * dead-letter with the error. Two things it does NOT do — it does not talk to any provider
 * directly (that is the adapter's job, resolved by provider key), and it does not read across
 * tenants. The dispatch table keeps FORCE RLS; the worker binds each tenant in turn via
 * TenantContext.run so the tenant-scoped pool applies the policy on its behalf.
 */
@Injectable()
export class MailDispatchWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('MailDispatch');
  private readonly registry = new MailProviderRegistry();
  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  constructor(
    @Inject(MAIL_STORE) private readonly store: MailStore,
    private readonly tenant: TenantContext,
  ) {
    // aura-internal is the reference adapter; Gmail and Microsoft 365 register here in a later
    // slice without this file changing.
    this.registry.register(new AuraInternalMailAdapter());
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.drain(), POLL_MS);
    this.timer.unref(); // never keep the process alive just to poll
    this.logger.log(`Mail dispatch worker started — draining every ${POLL_MS}ms.`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass over every tenant. Re-entrancy guarded, like the outbox relay. */
  async drain(now = new Date().toISOString()): Promise<{ sent: number; failed: number }> {
    if (this.draining) return { sent: 0, failed: 0 };
    this.draining = true;
    const totals = { sent: 0, failed: 0 };
    try {
      const tenants = await this.store.listTenantsWithMailbox();
      for (const tenantId of tenants) {
        // Bind the tenant so the tenant-scoped pool sets the RLS GUC for these statements. Without
        // this the claim would legitimately see nothing — the policy is doing its job.
        const result = await this.tenant.run(
          { tenantId, companyId: null, actorId: 'system' },
          () => this.drainTenant(tenantId, now),
        );
        totals.sent += result.sent;
        totals.failed += result.failed;
      }
    } catch (error) {
      // A background poller has no request to absorb a rejection; an uncaught one here took the
      // whole API down once before (see the outbox relay). Log and try again next tick.
      this.logger.error(`Dispatch drain failed: ${(error as Error).message}`);
    } finally {
      this.draining = false;
    }
    return totals;
  }

  private async drainTenant(tenantId: string, now: string): Promise<{ sent: number; failed: number }> {
    const claimed = await this.store.claimDueDispatch(tenantId, now, BATCH);
    let sent = 0;
    let failed = 0;
    for (const dispatch of claimed) {
      const ok = await this.deliver(tenantId, dispatch);
      if (ok) sent += 1; else failed += 1;
    }
    return { sent, failed };
  }

  /** Resolve the account this message goes out through. */
  private accountFor(mail: MailRecord, tenantId: string): MailAccountRef {
    // Until Admin Center manages accounts, mail with no account goes through aura-internal. The
    // shape is the real one, so attaching a configured account later changes data, not code.
    return {
      id: mail.accountId ?? 'aura-internal',
      tenantId,
      companyId: mail.companyId,
      provider: 'aura-internal',
      externalAccountId: null,
      address: mail.participants.find((p) => p.role === 'from')?.address ?? 'aura@internal',
      capabilities: ['send', 'reply', 'reply_all', 'forward', 'attachments', 'read_state', 'scheduled_send'],
      status: 'connected',
    };
  }

  private async deliver(tenantId: string, dispatch: DispatchRecord): Promise<boolean> {
    const mail = await this.store.get(tenantId, dispatch.subjectId);
    if (!mail) {
      await this.store.completeDispatch(tenantId, dispatch.id, new Date().toISOString());
      this.logger.warn(`Dispatch ${dispatch.id} references a mail that no longer exists — closed.`);
      return false;
    }

    // Idempotence beyond the claim: if this message already left, never send it twice. The claim
    // makes concurrent duplicates impossible; this covers a retry that succeeded on the provider
    // and failed on the way back.
    if (mail.state === 'sent') {
      await this.store.completeDispatch(tenantId, dispatch.id, new Date().toISOString());
      return true;
    }
    // A user may have cancelled between scheduling and now. Cancel wins.
    if (mail.state === 'cancelled') {
      await this.store.completeDispatch(tenantId, dispatch.id, new Date().toISOString());
      return false;
    }

    await this.store.save(tenantId, { ...mail, state: 'sending', updatedAt: new Date().toISOString() });

    try {
      const account = this.accountFor(mail, tenantId);
      const adapter = this.registry.get(account.provider);
      requireCapability(adapter, account, 'send');
      const result = await adapter.send(account, mail);

      await this.store.save(tenantId, {
        ...mail,
        state: 'sent',
        sentAt: result.sentAt,
        providerMessageId: result.providerMessageId,
        providerThreadId: result.providerThreadId,
        internetMessageId: result.internetMessageId,
        failedReason: null,
        updatedAt: new Date().toISOString(),
      });
      await this.store.completeDispatch(tenantId, dispatch.id, result.sentAt);
      return true;
    } catch (error) {
      return this.recordFailure(tenantId, dispatch, mail, error as Error);
    }
  }

  private async recordFailure(tenantId: string, dispatch: DispatchRecord, mail: MailRecord, error: Error): Promise<boolean> {
    const attempts = dispatch.attempts + 1;
    // A permanent refusal is not worth retrying — a bad address will still be bad in four minutes.
    const permanent = error instanceof PermanentDeliveryError;
    const giveUp = permanent || attempts >= MAX_ATTEMPTS;
    const retryAt = giveUp ? null : new Date(Date.now() + retryDelayMs(attempts)).toISOString();

    await this.store.failDispatch(tenantId, dispatch.id, error.message, retryAt);
    await this.store.save(tenantId, {
      ...mail,
      // Only a final failure is the message's own state. A retryable one leaves it queued, because
      // it is still going to be sent — telling the user it failed and then sending it is worse
      // than saying nothing yet.
      state: giveUp ? 'failed' : 'queued',
      failedReason: giveUp ? error.message : null,
      updatedAt: new Date().toISOString(),
    });

    if (giveUp) {
      this.logger.error(`Mail ${mail.id} dead-lettered after ${attempts} attempt(s): ${error.message}`);
    } else {
      this.logger.warn(`Mail ${mail.id} attempt ${attempts} failed, retrying at ${retryAt}: ${error.message}`);
    }
    return false;
  }

  /** Exposed for tests and for a future admin "retry now" action. */
  registerAdapterForTesting(adapter: Parameters<MailProviderRegistry['register']>[0]): void {
    this.registry.register(adapter);
  }
}
