import type { MailRecord, MailState } from './mail-domain';

/** DI token for the mail persistence store. */
export const MAIL_STORE = Symbol('MAIL_STORE');

export interface MailFilter {
  /** The caller's address — mail is only ever listed for someone. */
  address: string;
  states?: MailState[];
  /** 'inbox' reads what was addressed to you; 'sent' what you sent. */
  folder?: 'inbox' | 'sent' | 'drafts' | 'scheduled';
  limit?: number;
}

export interface ScheduledDispatch {
  id: string;
  subjectType: 'mail' | 'whatsapp' | 'meeting';
  subjectId: string;
  accountId: string | null;
  scheduledAt: string;
  scheduledTimezone: string;
  state: 'pending' | 'claimed' | 'processing' | 'done' | 'failed' | 'cancelled';
  attempts: number;
}

/**
 * Mail persistence. Every method takes tenantId explicitly for the same reason the comms store
 * does: a leaked row here is somebody's mail, so scope is an argument the caller cannot forget,
 * and RLS is the second line rather than the only one.
 */
export interface MailStore {
  save(tenantId: string, mail: MailRecord): Promise<void>;
  get(tenantId: string, mailId: string): Promise<MailRecord | null>;
  list(tenantId: string, filter: MailFilter): Promise<MailRecord[]>;
  /** Every message in a conversation, oldest first. */
  thread(tenantId: string, threadId: string): Promise<MailRecord[]>;
  delete(tenantId: string, mailId: string): Promise<void>;
  markRead(tenantId: string, mailId: string, address: string, at: string): Promise<void>;
  /** Returns the existing record when this provider message was already imported. */
  findByProviderMessage(tenantId: string, accountId: string | null, providerMessageId: string): Promise<MailRecord | null>;

  scheduleDispatch(tenantId: string, dispatch: ScheduledDispatch): Promise<void>;
  cancelDispatch(tenantId: string, subjectId: string, at: string): Promise<void>;
  getDispatch(tenantId: string, subjectId: string): Promise<ScheduledDispatch | null>;
}
