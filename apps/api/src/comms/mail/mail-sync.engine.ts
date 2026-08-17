import { Inject, Injectable, Logger } from '@nestjs/common';
import { newId } from '@aura/shared';
import {
  CapabilityUnsupportedError,
  supports,
  type MailAccountRef,
  type MailProviderAdapter,
  type SyncCursor,
} from './mail-delivery';
import { normaliseAddress, snippetOf, type MailParticipant, type MailRecord } from './mail-domain';
import { MAIL_STORE, type MailStore } from './mail-store';

/** How many pages one account may pull per run, so one huge mailbox cannot starve the others. */
const MAX_PAGES = 20;

export interface SyncOutcome {
  imported: number;
  duplicates: number;
  pages: number;
  cursor: SyncCursor | null;
  error: string | null;
}

/**
 * The inbound mail sync engine — provider-neutral.
 *
 * It pulls through the adapter contract and knows nothing about Gmail, Graph or IMAP. Its job is
 * the part that is identical for all of them: page through what changed, refuse to import the same
 * message twice, attach each message to the right thread, and remember where it got to.
 *
 * THE IDEMPOTENCY BOUNDARY IS (account, providerMessageId). Not the message id — AURA mints those,
 * so a re-fetch would mint a new one and duplicate. Not providerMessageId alone either: two
 * accounts can legitimately hold the same message (a shared mailbox and a personal one both
 * receiving it), and collapsing those would make one account's copy vanish.
 *
 * Only this engine produces `received`. A user request cannot reach that state.
 */
@Injectable()
export class MailSyncEngine {
  private readonly logger = new Logger('MailSync');

  constructor(@Inject(MAIL_STORE) private readonly store: MailStore) {}

  async syncAccount(account: MailAccountRef, adapter: MailProviderAdapter, cursor: SyncCursor | null): Promise<SyncOutcome> {
    const outcome: SyncOutcome = { imported: 0, duplicates: 0, pages: 0, cursor, error: null };

    if (!supports(adapter, account, 'fetch_messages')) {
      // Not an error worth retrying — this account simply has no mailbox to pull from. Reported
      // rather than thrown so a mixed set of accounts does not abort on the first internal one.
      outcome.error = new CapabilityUnsupportedError(adapter.provider, 'fetch_messages').message;
      return outcome;
    }
    if (account.status !== 'connected') {
      outcome.error = `account is ${account.status}`;
      return outcome;
    }

    let current = cursor;
    try {
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await adapter.fetchSince!(account, current);
        outcome.pages += 1;

        for (const incoming of result.messages) {
          const { imported } = await this.importOne(account, incoming);
          if (imported) outcome.imported += 1; else outcome.duplicates += 1;
        }

        // The cursor advances only AFTER the WHOLE page is durably imported.
        //
        // The asymmetry matters: re-reading a page is harmless because (account,
        // providerMessageId) deduplicates it, but skipping a message that was never imported is
        // unrecoverable — nothing will ever fetch it again. So on a mid-page failure below, the
        // cursor stays where it was and the page is simply read again.
        current = result.cursor;
        outcome.cursor = current;
        if (!result.hasMore) break;
      }
    } catch (error) {
      // `outcome.cursor` still points at the last page that finished, never the one that broke.
      // The error is reported for the account's sync_state; it is NOT the checkpoint.
      outcome.error = (error as Error).message;
      this.logger.warn(`Sync for account ${account.id} stopped after ${outcome.pages} page(s): ${outcome.error}`);
    }

    return outcome;
  }

  /**
   * Import one provider message. Returns `imported: false` when AURA already holds it, which is
   * the normal case on a replayed page, not an error.
   */
  async importOne(account: MailAccountRef, incoming: MailRecord): Promise<{ mail: MailRecord; imported: boolean }> {
    if (!incoming.providerMessageId) {
      // Without provider identity there is no way to recognise this message on the next poll, so
      // importing it would guarantee a duplicate later. Refusing is the safe direction.
      throw new Error('Cannot import a message with no provider message id — it could never be deduplicated');
    }

    const existing = await this.store.findByProviderMessage(account.tenantId, account.id, incoming.providerMessageId);
    if (existing) return { mail: existing, imported: false };

    // AURA always mints its own id. Reusing whatever the provider (or a previous account's copy)
    // carried collapses the two rows when the SAME provider message legitimately lands on two
    // accounts — a shared mailbox and a personal one — and one account's copy silently vanishes.
    // The provider's identity is providerMessageId; the primary key is ours.
    const id = newId();
    const threadId = await this.resolveThread(account, incoming, id);
    const mail: MailRecord = {
      ...incoming,
      id,
      tenantId: account.tenantId,
      companyId: account.companyId,
      accountId: account.id,
      direction: 'inbound',
      // Reachable from here and nowhere else.
      state: 'received',
      fromUser: null,
      participants: this.normaliseEnvelope(incoming.participants),
      threadId,
      snippet: incoming.snippet ?? snippetOf(incoming.body ?? ''),
      sentAt: incoming.sentAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.assertAttachmentsAreReferences(mail);
    await this.store.save(account.tenantId, mail);
    return { mail, imported: true };
  }

  /**
   * Attach the message to the conversation it belongs to.
   *
   * Provider thread id first, because that is the provider's own answer. Failing that, the
   * Internet headers — In-Reply-To then the last id in References — which is how mail threads
   * across systems that have never heard of each other. Only when neither resolves does the
   * message start its own thread; guessing by subject would merge unrelated conversations that
   * happen to share a subject line, which is worse than a thread too many.
   */
  private async resolveThread(account: MailAccountRef, incoming: MailRecord, mintedId: string): Promise<string> {
    if (incoming.providerThreadId) {
      const sibling = await this.store.findByProviderThread(account.tenantId, account.id, incoming.providerThreadId);
      if (sibling) return sibling.threadId;
    }

    const references = (incoming.referencesHeader ?? '').trim().split(/\s+/).filter(Boolean);
    const candidates = [incoming.inReplyTo, ...references.reverse()].filter((value): value is string => Boolean(value));
    for (const messageId of candidates) {
      const parent = await this.store.findByInternetMessageId(account.tenantId, messageId);
      if (parent) return parent.threadId;
    }

    return mintedId;
  }

  /** Normalise addresses and drop participants a provider sent with neither address nor user. */
  private normaliseEnvelope(participants: MailParticipant[]): MailParticipant[] {
    return (participants ?? [])
      .filter((participant) => participant.address || participant.userId)
      .map((participant) => ({
        ...participant,
        address: participant.address ? normaliseAddress(participant.address) : null,
        // Read state is AURA's, hydrated from mail_reads — never whatever a provider claims.
        readAt: undefined,
      }));
  }

  /**
   * Inbound attachments must arrive as DMS references, never as inline bytes.
   *
   * Communication is not a file store: the document module owns bytes, versions and permissions.
   * An adapter that hands over a data: URL would quietly make AURA a second, unmanaged copy of
   * every attachment a mailbox ever received — unbounded, unversioned and outside document access
   * control. Refusing here keeps that impossible rather than merely discouraged.
   */
  private assertAttachmentsAreReferences(mail: MailRecord): void {
    const inline = (mail as { attachments?: Array<{ dataUrl?: string | null; documentId?: string | null }> }).attachments ?? [];
    const offending = inline.find((attachment) => attachment.dataUrl && !attachment.documentId);
    if (offending) {
      throw new Error('Inbound attachments must reference a document, not carry inline bytes');
    }
  }
}
