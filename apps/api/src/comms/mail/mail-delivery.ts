import type { MailRecord } from './mail-domain';

/**
 * The delivery / sync contract — the seam between the mail domain and any provider.
 *
 *   Mail Domain  →  these contracts  →  Provider Adapter (aura-internal | Gmail | Microsoft 365)
 *
 * MailService depends on this interface and never on a provider SDK. That is the whole point: a
 * Gmail adapter must be addable without opening the domain, and a domain rule must be changeable
 * without opening three adapters.
 *
 * Adapters are registered by provider key at the module boundary (C3.2). Nothing here reads
 * credentials — an adapter is handed an already-resolved account by the caller, and where those
 * credentials come from is the Admin Center's business, not the mail engine's.
 */

export interface MailAccountRef {
  id: string;
  tenantId: string;
  provider: string;
  /** The mailbox this account sends as. */
  address: string;
  capabilities: string[];
  status: string;
}

export interface DeliveryResult {
  /** The provider's id for the message it accepted, kept for idempotent re-sync. */
  providerMessageId: string | null;
  providerThreadId: string | null;
  /** RFC Message-ID, when the provider exposes one; it is what threads across systems. */
  internetMessageId: string | null;
  sentAt: string;
}

export interface SyncCursor {
  /** Opaque to AURA: a Gmail historyId, a Graph delta link, whatever the provider uses. */
  token: string | null;
  fetchedAt: string;
}

export interface SyncPage {
  messages: MailRecord[];
  cursor: SyncCursor;
}

/**
 * What a provider must be able to do. `capabilities` on the account says which of these are
 * actually available, so the UI can offer scheduling only where it is real rather than offering
 * it everywhere and failing at send time.
 */
export interface MailProviderAdapter {
  readonly provider: string;

  /** Hand the message to the provider. Throwing marks the attempt failed; the domain decides retry. */
  send(account: MailAccountRef, mail: MailRecord): Promise<DeliveryResult>;

  /**
   * Fetch messages changed since the cursor. Implementations must be safe to call twice with the
   * same cursor — the sync engine deduplicates on providerMessageId, but an adapter that
   * double-charges or double-marks on read would defeat that.
   */
  fetchSince?(account: MailAccountRef, cursor: SyncCursor | null): Promise<SyncPage>;
}

/** Thrown by an adapter when the provider refused for a reason retrying will not fix. */
export class PermanentDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentDeliveryError';
  }
}
