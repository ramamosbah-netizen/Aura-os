import type { ChatChannel, ChatMessage, MailMessage } from '@aura/shared';

/**
 * A channel plus the company it belongs to. `companyId: null` means tenant-global — the seeded
 * directory channels are shared by the whole tenant, exactly like the workflow store's convention
 * for tenant-global instances. Kept out of the shared ChatChannel so the web model is unchanged.
 */
export interface StoredChannel extends ChatChannel {
  companyId: string | null;
}

/**
 * One activity on the Communication timeline. A NARROW PROJECTION of a record that lives
 * elsewhere: `subjectType`/`subjectId` point at the owner, and title/preview are derived labels
 * so the Overview timeline renders without joining every channel. Nothing here is authoritative —
 * rebuilding the table from the owning records must lose nothing.
 */
export interface TimelineEntry {
  id: string;
  companyId: string | null;
  occurredAt: string;
  channel: 'chat' | 'mail' | 'whatsapp' | 'meeting' | 'file_share';
  direction: 'inbound' | 'outbound' | 'internal';
  actor: string | null;
  subjectType: string;
  subjectId: string;
  title: string;
  preview: string | null;
  /** The channel's own authorization answer, carried so readers inherit it rather than re-derive it. */
  visibility: 'participants' | 'channel' | 'tenant';
  visibilityKey: string | null;
}

/** DI token for the communication persistence store. */
export const COMMS_STORE = Symbol('COMMS_STORE');

/**
 * Persistence for team chat + internal mail.
 *
 * Every method takes an explicit tenantId. Communication is the one module where a leaked row is
 * immediately somebody's private conversation, so the scope is a required argument rather than
 * something a caller can forget — RLS is the second line, not the only one.
 *
 * Channel ids are the deterministic domain ids from the shared model ("ch-company",
 * "dm:u-a|u-b"), not surrogate keys; see migration 0234.
 */
export interface CommsStore {
  /** Channels known to the tenant. Seeded from the workspace directory on first use. */
  listChannels(tenantId: string): Promise<StoredChannel[]>;
  /** Insert channels that do not exist yet. Idempotent, so seeding can run on every boot. */
  ensureChannels(tenantId: string, channels: ChatChannel[], createdBy: string, companyId?: string | null): Promise<void>;
  getChannel(tenantId: string, channelId: string): Promise<StoredChannel | null>;

  listMessages(tenantId: string, channelId: string): Promise<ChatMessage[]>;
  addMessage(tenantId: string, companyId: string | null, message: ChatMessage): Promise<void>;

  /** Per-user, per-channel read watermark. */
  getLastRead(tenantId: string, channelId: string, username: string): Promise<string | null>;
  setLastRead(tenantId: string, channelId: string, username: string, at: string): Promise<void>;

  /** Mail visible to the user: everything they sent or received. */
  listMailFor(tenantId: string, username: string): Promise<MailMessage[]>;
  getMail(tenantId: string, mailId: string): Promise<MailMessage | null>;
  /**
   * `thread` carries the real reply/forward edges. A root mail is its own thread; a reply inherits
   * its parent's threadId. Kept out of MailMessage so the shared model stays unchanged in C1.
   */
  addMail(
    tenantId: string,
    companyId: string | null,
    mail: MailMessage,
    thread: { threadId: string; parentMailId: string | null; forwardedFromMailId: string | null },
  ): Promise<void>;
  markMailRead(tenantId: string, mailId: string, username: string, at: string): Promise<void>;

  /**
   * Index an activity on the Communication timeline. Idempotent per (tenant, subject): re-publishing
   * the same record must not double it, because a sync that replays is normal, not exceptional.
   */
  publishTimeline(tenantId: string, entry: TimelineEntry): Promise<void>;
}
