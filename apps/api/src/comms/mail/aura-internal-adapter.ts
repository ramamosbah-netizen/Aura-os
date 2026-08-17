import { newId } from '@aura/shared';
import type { DeliveryResult, MailAccountRef, MailProviderAdapter } from './mail-delivery';
import type { MailRecord } from './mail-domain';

/**
 * The AURA-internal mail provider.
 *
 * Internal mail is not a special case bolted onto the side of the mail engine — it is a provider
 * like any other, so there is one send path rather than two. Delivery is simply "the message is
 * already in our database and the recipients are AURA users", which is why this adapter does no
 * transport work: it stamps the identifiers a provider would have returned and hands back.
 *
 * It exists mostly to prove the seam. If internal mail can be expressed as an adapter, Gmail and
 * Microsoft 365 can be added later without the domain learning anything new.
 */
export class AuraInternalMailAdapter implements MailProviderAdapter {
  readonly provider = 'aura-internal';

  async send(account: MailAccountRef, mail: MailRecord): Promise<DeliveryResult> {
    const sentAt = new Date().toISOString();
    // A stable, AURA-owned Message-ID so an internal thread chains by the same rules an external
    // one does — and so a future external reply can reference it.
    const internetMessageId = `<${mail.id}@aura.internal>`;
    return {
      providerMessageId: `aura-internal:${mail.id}`,
      providerThreadId: `aura-internal:${mail.threadId}`,
      internetMessageId,
      sentAt,
    };
  }

  /**
   * Internal mail has nothing to pull: it is written straight into AURA by the sender, so there
   * is no external mailbox to poll. Declared rather than omitted so the absence is a stated fact
   * instead of a missing method someone later mistakes for an oversight.
   */
  async fetchSince(): Promise<never> {
    throw new Error('aura-internal mail is written directly and has nothing to synchronise');
  }
}

/** A well-known account row shape for the internal provider, used until Admin Center manages accounts. */
export function internalAccountRef(tenantId: string, address: string): MailAccountRef {
  return {
    id: newId(),
    tenantId,
    provider: 'aura-internal',
    address,
    capabilities: ['send', 'schedule'],
    status: 'connected',
  };
}
