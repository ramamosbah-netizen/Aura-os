import type { MailRecord } from './mail-domain';

/**
 * The provider contract — the seam between the AURA mail domain and any transport.
 *
 *   Mail Domain  →  THIS FILE  →  Provider Adapter (aura-internal | Gmail | Microsoft 365 | IMAP)
 *
 * MailService depends on the domain and on nothing here that names a vendor. Adding Gmail must
 * mean adding an adapter, not opening the domain; changing a domain rule must not mean opening
 * three adapters. A contract test enforces that direction of dependency.
 *
 * NO CREDENTIALS PASS THROUGH HERE. An adapter is handed an already-resolved account reference
 * carrying identity and status, never a token, refresh token, client secret, webhook secret or
 * password. Where those live and how they are refreshed is the Admin Center integration layer's
 * problem; Communication must not be able to leak what it never holds.
 */

/**
 * What a mail provider can be asked to do.
 *
 * Explicit because providers genuinely differ: Gmail and Graph expose server-side drafts, a plain
 * SMTP relay does not; Gmail can schedule, IMAP cannot; internal mail has nothing to poll. A UI
 * that assumes uniformity offers buttons that fail at the last moment, which is worse than not
 * offering them.
 */
export type MailCapability =
  | 'send'
  | 'reply'
  | 'reply_all'
  | 'forward'
  | 'fetch_messages'
  | 'fetch_threads'
  | 'attachments'
  | 'read_state'
  | 'drafts'
  | 'scheduled_send';

/** Connection lifecycle, matching the status vocabulary the account table already constrains. */
export type ProviderStatus =
  | 'not_configured'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'error'
  | 'disabled';

/**
 * A connected account, as Communication sees it — the shared account model from C3.0
 * (aura_comms_accounts) narrowed to what an adapter needs.
 *
 * `capabilities` here is what THIS CONNECTION is permitted and able to do, which is not the same
 * as what the provider can do in general: a read-only mailbox connection may legitimately omit
 * `send`. The effective answer is the intersection with the adapter's own capabilities, computed
 * by `effectiveCapabilities`.
 */
export interface MailAccountRef {
  id: string;
  tenantId: string;
  companyId: string | null;
  provider: string;
  /** The provider's own id for this mailbox — never a credential. */
  externalAccountId: string | null;
  /** The address this account sends as. */
  address: string;
  capabilities: MailCapability[];
  status: ProviderStatus;
}

export interface ProviderHealth {
  status: ProviderStatus;
  /** Human-readable reason when the status is not `connected`. Never includes secret material. */
  detail: string | null;
  checkedAt: string;
}

export interface DeliveryResult {
  /** The provider's id for the message it accepted — what makes a re-sync idempotent. */
  providerMessageId: string | null;
  providerThreadId: string | null;
  /** RFC Message-ID where the provider exposes one; it is what threads across systems. */
  internetMessageId: string | null;
  sentAt: string;
}

export interface SyncCursor {
  /** Opaque to AURA: a Gmail historyId, a Graph delta link, an IMAP UIDVALIDITY/UID pair. */
  token: string | null;
  fetchedAt: string;
}

export interface SyncPage {
  messages: MailRecord[];
  cursor: SyncCursor;
  /** True when the provider has more waiting; the engine keeps paging rather than guessing. */
  hasMore: boolean;
}

export interface ThreadPage {
  /** Messages belonging to one provider thread, oldest first. */
  messages: MailRecord[];
  providerThreadId: string;
}

/**
 * What every mail adapter implements.
 *
 * Only `provider`, `capabilities`, `health` and `send` are required — the rest are optional
 * because a provider that cannot do them should not be forced to pretend. Calling an unsupported
 * operation is a programming error surfaced by `requireCapability`, not a silent no-op.
 */
export interface MailProviderAdapter {
  readonly provider: string;
  /** What this ADAPTER can do at all, before any per-account restriction. */
  readonly capabilities: MailCapability[];

  /** Cheap liveness/config probe. Must never throw for a misconfigured account — report it. */
  health(account: MailAccountRef): Promise<ProviderHealth>;

  /** Hand the message to the provider. Throwing marks the attempt failed; the engine decides retry. */
  send(account: MailAccountRef, mail: MailRecord): Promise<DeliveryResult>;

  /**
   * Fetch messages changed since the cursor. Must be safe to call twice with the same cursor:
   * the sync engine deduplicates on providerMessageId, but an adapter that mutates provider state
   * on read (marking seen, advancing a pointer) would defeat that.
   */
  fetchSince?(account: MailAccountRef, cursor: SyncCursor | null, limit?: number): Promise<SyncPage>;

  /** Fetch one full conversation, for opening a thread AURA has only part of. */
  fetchThread?(account: MailAccountRef, providerThreadId: string): Promise<ThreadPage>;

  /** Persist a draft on the provider, for providers that own drafts server-side. */
  saveDraft?(account: MailAccountRef, mail: MailRecord): Promise<DeliveryResult>;

  /** Push read state outward, for providers that model it. */
  markRead?(account: MailAccountRef, providerMessageId: string, read: boolean): Promise<void>;

  /** Ask the provider to hold a message until `sendAt`, where it supports that natively. */
  scheduleSend?(account: MailAccountRef, mail: MailRecord, sendAt: string): Promise<DeliveryResult>;
}

/**
 * What can actually be done on this account: the adapter's abilities intersected with the
 * connection's grants. Asking either side alone gives the wrong answer — an adapter that supports
 * sending says nothing about a mailbox connected read-only.
 */
export function effectiveCapabilities(adapter: MailProviderAdapter, account: MailAccountRef): MailCapability[] {
  return adapter.capabilities.filter((capability) => account.capabilities.includes(capability));
}

export function supports(adapter: MailProviderAdapter, account: MailAccountRef, capability: MailCapability): boolean {
  return effectiveCapabilities(adapter, account).includes(capability);
}

/** Raised when a caller asks for something this provider/account pair cannot do. */
export class CapabilityUnsupportedError extends Error {
  constructor(
    readonly provider: string,
    readonly capability: MailCapability,
  ) {
    super(`${provider} does not support ${capability} on this account`);
    this.name = 'CapabilityUnsupportedError';
  }
}

/**
 * Fail loudly rather than silently doing nothing. A scheduled send that quietly becomes an
 * immediate send, or a sync that quietly returns nothing, is far more expensive to diagnose than
 * an error at the call site.
 */
export function requireCapability(
  adapter: MailProviderAdapter,
  account: MailAccountRef,
  capability: MailCapability,
): void {
  if (!supports(adapter, account, capability)) {
    throw new CapabilityUnsupportedError(adapter.provider, capability);
  }
}

/** Raised by an adapter when the provider refused for a reason retrying will not fix. */
export class PermanentDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentDeliveryError';
  }
}

/**
 * Resolves a provider key to its adapter. The registry is the only place that knows which
 * adapters exist, so the dispatch engine (C3.3) can send through any account without naming a
 * vendor, and an unknown provider fails with a clear message instead of a missing-method crash.
 */
export class MailProviderRegistry {
  private readonly adapters = new Map<string, MailProviderAdapter>();

  register(adapter: MailProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: string): MailProviderAdapter {
    const adapter = this.adapters.get(provider);
    // Phrased so the error taxonomy classifies it as a 400 rather than letting it escape as a
    // 500: asking for a provider AURA has no adapter for is a bad request about configuration,
    // not an internal fault.
    if (!adapter) throw new Error(`Unknown mail provider "${provider}" — no adapter is registered`);
    return adapter;
  }

  has(provider: string): boolean {
    return this.adapters.has(provider);
  }

  list(): MailProviderAdapter[] {
    return [...this.adapters.values()];
  }
}
