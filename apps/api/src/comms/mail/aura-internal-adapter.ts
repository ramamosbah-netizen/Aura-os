import type {
  DeliveryResult,
  MailAccountRef,
  MailCapability,
  MailProviderAdapter,
  ProviderHealth,
} from './mail-delivery';
import { CapabilityUnsupportedError } from './mail-delivery';
import type { MailRecord } from './mail-domain';

/**
 * The AURA-internal mail provider — the reference implementation of the adapter contract.
 *
 * Internal mail is not a special case wired alongside the mail engine; it is a provider like any
 * other, so there is one send path rather than two. "Delivery" is simply that the message is
 * already in AURA's database and its recipients are AURA users, which is why this adapter does no
 * transport work: it returns the identifiers a real provider would have returned.
 *
 * It exists to prove the seam without secrets or a network. If internal mail fits the contract,
 * Gmail and Microsoft 365 can be added later without the domain learning anything new.
 */
export class AuraInternalMailAdapter implements MailProviderAdapter {
  readonly provider = 'aura-internal';

  /**
   * Deliberately NOT the full list.
   *
   * There is no external mailbox to poll, so `fetch_messages` and `fetch_threads` are absent — a
   * sync would have nothing to sync. Drafts live in AURA's own tables rather than on a provider,
   * so `drafts` is absent too. Claiming either would make the capability check meaningless, which
   * is the whole reason it exists.
   */
  readonly capabilities: MailCapability[] = [
    'send',
    'reply',
    'reply_all',
    'forward',
    'attachments',
    'read_state',
    'scheduled_send',
  ];

  async health(account: MailAccountRef): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    // Internal mail needs no connection, so the only thing that can be wrong is the account being
    // switched off. Reported rather than thrown: a health probe that throws cannot report.
    if (account.status === 'disabled') {
      return { status: 'disabled', detail: 'This internal mail account is disabled.', checkedAt };
    }
    return { status: 'connected', detail: null, checkedAt };
  }

  async send(_account: MailAccountRef, mail: MailRecord): Promise<DeliveryResult> {
    return {
      providerMessageId: `aura-internal:${mail.id}`,
      providerThreadId: `aura-internal:${mail.threadId}`,
      // A stable, AURA-owned Message-ID so an internal thread chains by the same rules an external
      // one does — and so a later external reply can reference it.
      internetMessageId: `<${mail.id}@aura.internal>`,
      sentAt: new Date().toISOString(),
    };
  }

  /**
   * Internal mail is delivered the moment it is written, so holding it is the dispatch engine's
   * job rather than the provider's. Declared so the capability is honest — `scheduled_send` is
   * supported at the AURA level — while making clear nothing is handed to a provider to hold.
   */
  async scheduleSend(account: MailAccountRef, mail: MailRecord, _sendAt: string): Promise<DeliveryResult> {
    return this.send(account, mail);
  }

  async markRead(_account: MailAccountRef, _providerMessageId: string, _read: boolean): Promise<void> {
    // Read state for internal mail is authoritative in AURA (aura_comms_mail_reads); there is no
    // outward system to push it to. A no-op is the correct behaviour, not a missing feature.
  }

  /**
   * Present only to fail clearly. An engine that asks internal mail to sync has a bug, and a
   * thrown capability error names it at the call site instead of returning an empty page that
   * looks like "no new mail".
   */
  async fetchSince(): Promise<never> {
    throw new CapabilityUnsupportedError(this.provider, 'fetch_messages');
  }
}
