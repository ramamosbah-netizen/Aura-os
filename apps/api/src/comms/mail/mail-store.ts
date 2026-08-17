import type { MailRecord, MailState } from './mail-domain';

/** DI token for mail persistence. */
export const MAIL_STORE = Symbol('MAIL_STORE');

export interface MailFilter {
  /** Who is asking. Mail is only ever listed for someone. */
  address?: string | null;
  userId?: string | null;
  folder?: 'inbox' | 'sent' | 'drafts' | 'scheduled';
  limit?: number;
}

export interface DispatchRecord {
  id: string;
  subjectType: 'mail' | 'whatsapp' | 'meeting';
  subjectId: string;
  accountId: string | null;
  /** UTC instant. */
  scheduledAt: string;
  /** What the user actually chose — "08:00 Asia/Dubai" is intent a UTC stamp alone cannot show back. */
  scheduledTimezone: string;
  state: 'pending' | 'claimed' | 'processing' | 'done' | 'failed' | 'cancelled';
  attempts: number;
}

/**
 * Mail persistence — a FACET of the Communication bounded context, not a separate one.
 *
 * Mail shares participants, context, attachments, dispatch and the timeline with chat, WhatsApp
 * and meetings. Giving mail its own parallel copies of those would rebuild exactly the silos this
 * whole slice exists to remove, so implementations here write the SHARED tables introduced in
 * 0235 and treat aura_comms_mail as the mail-specific part only.
 *
 * ONE WRITE PATH. `save` writes the canonical rows (mail + participants + mail_reads) and, in the
 * same transaction, refreshes the legacy aura_comms_mail_recipients projection. Nothing else may
 * write that legacy table: two independent writers is how the old and new models drift apart
 * while every individual test still passes.
 */
export interface MailStore {
  /** Canonical write. Refreshes the legacy projection in the same transaction. */
  save(tenantId: string, mail: MailRecord): Promise<void>;
  get(tenantId: string, mailId: string): Promise<MailRecord | null>;
  list(tenantId: string, filter: MailFilter): Promise<MailRecord[]>;
  /** Every message in a conversation, oldest first. */
  thread(tenantId: string, threadId: string): Promise<MailRecord[]>;
  /** Only ever used on a message that has not left; enforced by the service, not here. */
  remove(tenantId: string, mailId: string): Promise<void>;
  markRead(tenantId: string, mailId: string, reader: { address?: string | null; userId?: string | null }, at: string): Promise<void>;

  /**
   * The idempotency seam for provider sync. A re-fetch of the same provider message must find the
   * mail AURA already holds rather than importing a second copy.
   */
  findByProviderMessage(tenantId: string, accountId: string | null, providerMessageId: string): Promise<MailRecord | null>;

  upsertDispatch(tenantId: string, dispatch: DispatchRecord): Promise<void>;
  getDispatch(tenantId: string, subjectId: string): Promise<DispatchRecord | null>;
  cancelDispatch(tenantId: string, subjectId: string, at: string): Promise<void>;
}

/**
 * Which lifecycle moves a USER may ask for.
 *
 * `sending`, `sent`, `failed` and `received` are absent on purpose: a user asks to send, and the
 * dispatch worker is what moves queued → sending → sent/failed. `received` only ever arrives from
 * an import. Letting a request set those would let the UI claim a message was delivered when
 * nothing had tried to deliver it.
 */
export const USER_SETTABLE_STATES: MailState[] = ['draft', 'scheduled', 'queued', 'cancelled'];
