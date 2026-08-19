import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationService } from '@aura/core';
import {
  type ChatChannel,
  type ChatMessage,
  type MailMessage,
  type Mailbox,
  type NewChatMessage,
  type NewMail,
  defaultChannelsForDirectory,
  displayName,
  dmChannelId,
  dmPeer,
  mailboxFor,
  makeChatMessage,
  makeMail,
  newId,
  unreadChatCount,
} from '@aura/shared';
import { WorkspaceConfigService } from '../workspace/workspace-config.service';
import { COMMS_STORE, type CommsStore, type StoredChannel, type TimelineEntry } from './comms-store';
import { MAIL_STORE, type MailStore } from './mail/mail-store';

/**
 * Who may see a channel, and therefore its messages and their attachments.
 *
 *   company     — everyone in the tenant. Unchanged: this is the all-hands channel.
 *   dm          — the two participants, and NOBODY else. Deliberately no admin bypass: an
 *                 administrator needs to run the platform, not read two colleagues' private
 *                 messages. This is the one rule that tightens existing behaviour, because
 *                 `visibleChannels` handed an admin every DM in the tenant.
 *   team/dept/  — members, or an admin. Administering a shared workspace channel is a real job.
 *   project
 *
 * Exported so the negative security tests can drive it directly as well as through HTTP.
 */
export function canAccessChannel(
  channel: StoredChannel,
  username: string,
  isAdmin: boolean,
  callerCompanyId: string | null = null,
): boolean {
  // Company isolation is checked FIRST, so it cannot be argued away by membership or by being an
  // administrator. A channel stamped for company Y is not company X's to read, full stop.
  //
  // `companyId: null` on the channel means tenant-global — the seeded directory channels, shared
  // by the whole tenant. This mirrors the workflow store's tenant-global convention rather than
  // inventing a second one.
  //
  // Worth stating plainly: today every locally issued session carries companyId = null, because
  // auth.controller mints `companyId: null` and verify() falls back to null when the IdP sends no
  // company claim. So this rule is INERT in the current deployment — which is exactly why it is
  // tested with explicit company values instead of through a session, and why writing
  // `channel.companyId === ctx.companyId` and calling it isolation would have been false comfort.
  if (channel.companyId !== null && channel.companyId !== callerCompanyId) return false;

  if (channel.kind === 'dm') return channel.members.includes(username);
  if (channel.kind === 'company') return true;
  return isAdmin || channel.members.includes(username);
}

/**
 * Project a canonical MailRecord back to the legacy MailMessage the web hub consumes. Kept as a
 * projection rather than a stored shape so the old consumers keep working untouched while the
 * canonical model moves ahead of them.
 */
function toLegacyMail(mail: MailRecordLike): MailMessage {
  // BCC is deliberately absent. The legacy MailMessage has a single flat `to[]` with no way to
  // mark a recipient blind, so including one would show every reader who was copied invisibly —
  // the exact disclosure a blind copy exists to prevent. A shape that cannot represent it safely
  // does not get to carry it.
  const recipients = mail.participants.filter((p) => p.role === 'to' || p.role === 'cc');
  const sender = mail.fromUser ?? mail.participants.find((p) => p.role === 'from')?.userId ?? '';
  return {
    id: mail.id,
    from: sender,
    to: recipients.map((p) => p.userId ?? p.address ?? '').filter(Boolean),
    subject: mail.subject,
    body: mail.body,
    sentAt: mail.sentAt ?? mail.createdAt,
    readBy: [sender, ...recipients.filter((p) => p.readAt).map((p) => p.userId ?? p.address ?? '')].filter(Boolean),
  };
}

interface MailRecordLike {
  id: string;
  fromUser: string | null;
  subject: string;
  body: string;
  sentAt: string | null;
  createdAt: string;
  participants: Array<{ role: string; address?: string | null; userId?: string | null; readAt?: string | null }>;
}

export interface ChannelSummary extends ChatChannel {
  unread: number;
  lastMessageAt: string | null;
  lastPreview: string | null;
}

/**
 * Team chat + internal mail, tenant-scoped, persisted through CommsStore (migration 0234).
 * Channels are seeded from the workspace directory so the org structure (company / departments)
 * matches the admin-configured roles; seeding is idempotent, so a restart re-asserts the same
 * channels without duplicating them or losing the conversations inside them.
 *
 * Every chat message and mail emits a notification for its recipients — the notification center
 * is the single "everything" feed.
 */
@Injectable()
export class CommsService {
  private readonly logger = new Logger('Comms');
  /** Tenants whose directory channels have been asserted this process. Not a data cache. */
  private readonly seeded = new Set<string>();

  constructor(
    private readonly workspace: WorkspaceConfigService,
    private readonly notifications: NotificationService,
    @Inject(COMMS_STORE) private readonly store: CommsStore,
    // The single mail write path. Mail is a facet of this context, so the legacy endpoint uses the
    // same persistence as MailService rather than a parallel one of its own.
    @Inject(MAIL_STORE) private readonly mail: MailStore,
  ) {}

  /**
   * Assert the directory channels exist, once per process per tenant. `ensureChannels` is an
   * upsert, so this adds a channel a new department earned without touching the messages already
   * in the ones that existed — which is what makes a restart invisible to users.
   */
  private async channelsFor(tenantId: string): Promise<StoredChannel[]> {
    if (!this.seeded.has(tenantId)) {
      const config = await this.workspace.get(tenantId);
      const expected = defaultChannelsForDirectory(config.assignments);
      await this.store.ensureChannels(tenantId, expected, 'system');
      this.seeded.add(tenantId);
      this.logger.log(`Asserted ${expected.length} directory chat channels for ${tenantId}.`);
    }
    return this.store.listChannels(tenantId);
  }

  private preview(m: ChatMessage): string {
    if (m.kind === 'voice') return '🎤 Voice message';
    if (m.kind === 'file') return `📎 ${m.attachment?.name ?? 'Attachment'}`;
    return m.text.length > 80 ? `${m.text.slice(0, 77)}…` : m.text;
  }

  /** Channels the user can see, with unread counts — DMs appear once used. */
  async channels(tenantId: string, username: string, isAdmin: boolean, companyId: string | null = null): Promise<ChannelSummary[]> {
    const all = await this.channelsFor(tenantId);
    // One rule decides the list and the reads, so a channel can never be listed to someone who
    // would then be refused its messages — or worse, listed to someone who would not be.
    const withDms = all.filter((c) => canAccessChannel(c, username, isAdmin, companyId));
    return Promise.all(withDms.map(async (c) => {
      const msgs = await this.store.listMessages(tenantId, c.id);
      const last = msgs[msgs.length - 1] ?? null;
      return {
        ...c,
        unread: unreadChatCount(msgs, username, await this.store.getLastRead(tenantId, c.id, username)),
        lastMessageAt: last?.sentAt ?? null,
        lastPreview: last ? this.preview(last) : null,
      };
    }));
  }

  /** Open (or create) the DM channel between two users. */
  async openDm(tenantId: string, me: string, peer: string, companyId: string | null = null): Promise<ChatChannel> {
    const id = dmChannelId(me, peer);
    const existing = await this.store.getChannel(tenantId, id);
    if (existing) return existing;
    const channel: ChatChannel = { id, kind: 'dm', name: displayName(peer), members: [me, peer].sort() };
    await this.store.ensureChannels(tenantId, [channel], me, companyId);
    return channel;
  }

  /**
   * The channel, if this caller may see it. Returns 404 rather than 403 for a channel they may
   * not: a distinct "forbidden" would confirm that a given DM exists between two named people,
   * which is itself the private fact. Same reason the workflow controller conceals out-of-scope
   * instances. Cross-tenant ids land here too — the store only ever reads within the tenant.
   */
  private async requireChannel(
    tenantId: string, username: string, channelId: string, isAdmin: boolean, companyId: string | null,
  ): Promise<StoredChannel> {
    await this.channelsFor(tenantId);
    const channel = await this.store.getChannel(tenantId, channelId);
    if (!channel || !canAccessChannel(channel, username, isAdmin, companyId)) {
      throw new NotFoundException(`channel ${channelId} not found`);
    }
    return channel;
  }

  /** Messages in a channel (marks the channel read for the caller). */
  async messages(
    tenantId: string, username: string, channelId: string, isAdmin = false, companyId: string | null = null,
  ): Promise<ChatMessage[]> {
    await this.requireChannel(tenantId, username, channelId, isAdmin, companyId);
    const msgs = await this.store.listMessages(tenantId, channelId);
    await this.store.setLastRead(tenantId, channelId, username, new Date().toISOString());
    return msgs;
  }

  /** Post a message; notifies the DM peer (chat notifications stay lightweight). */
  async post(
    tenantId: string,
    input: NewChatMessage,
    companyId: string | null = null,
    isAdmin = false,
  ): Promise<ChatMessage | { error: string }> {
    // Write access is the same question as read access, asked before the message exists — this
    // also stops a post to an id that is not a channel at all creating a phantom conversation.
    const channel = await this.requireChannel(tenantId, input.sender, input.channelId, isAdmin, companyId);
    const result = makeChatMessage(input);
    if ('error' in result) return result;
    await this.store.addMessage(tenantId, companyId, result);
    // Your own message never counts as unread to you.
    await this.store.setLastRead(tenantId, result.channelId, input.sender, result.sentAt);
    await this.publishTimeline(tenantId, {
      id: newId(),
      companyId,
      occurredAt: result.sentAt,
      channel: 'chat',
      direction: 'internal',
      actor: result.sender,
      subjectType: 'message',
      subjectId: result.id,
      title: channel.name,
      preview: this.preview(result),
      // The channel decides who may read it, so the timeline carries that answer rather than
      // inventing a second one.
      visibility: 'channel',
      visibilityKey: result.channelId,
    });

    const peer = dmPeer(result.channelId, input.sender);
    if (peer) {
      await this.notifications.record({
        tenantId,
        userId: peer,
        title: `New message from ${displayName(input.sender)}`,
        body: this.preview(result),
        category: 'chat',
        refType: 'chat.channel',
        refId: result.channelId,
      });
    }
    return result;
  }

  /** The user's mailbox (inbox + sent + unread). */
  async mailbox(tenantId: string, username: string): Promise<Mailbox> {
    // Reads follow the write: mail lives in the mail store now, and this projects it back to the
    // legacy MailMessage shape so /workspace and Communication see exactly what they saw before.
    const records = await this.mail.list(tenantId, { userId: username, limit: 200 });
    const sent = await this.mail.list(tenantId, { userId: username, folder: 'sent', limit: 200 });
    const projected = [...records, ...sent]
      .filter((mail, index, all) => all.findIndex((other) => other.id === mail.id) === index)
      .map((mail) => toLegacyMail(mail));
    return mailboxFor(projected, username);
  }

  /** Send internal mail — every recipient gets a notification. */
  async sendMail(tenantId: string, input: NewMail, companyId: string | null = null): Promise<MailMessage | { error: string }> {
    const result = makeMail(input);
    if ('error' in result) return result;
    // Delegated to THE mail write path (C3.1). The legacy endpoint keeps its old request and
    // response shape so /workspace and Communication are untouched, but the row it produces is
    // written exactly like one composed through MailService: canonical participants and the legacy
    // projection in one transaction. One writer per operation, not merely one per table.
    await this.mail.save(tenantId, {
      id: result.id,
      tenantId,
      companyId,
      accountId: null,
      direction: 'outbound',
      state: 'sent',
      fromUser: result.from,
      subject: result.subject,
      body: result.body,
      bodyHtml: null,
      snippet: result.body.length > 140 ? `${result.body.slice(0, 137)}…` : result.body,
      // Internal recipients are addressed by AURA user; no username is ever written as an address.
      participants: [
        { role: 'from', address: null, userId: result.from },
        ...result.to.map((username) => ({ role: 'to' as const, address: null, userId: username })),
      ],
      threadId: result.id,
      parentMailId: null,
      forwardedFromMailId: null,
      providerMessageId: null,
      providerThreadId: null,
      internetMessageId: null,
      inReplyTo: null,
      referencesHeader: null,
      sentAt: result.sentAt,
      failedReason: null,
      deliveryKey: null,
      deliveryStartedAt: null,
      deliveryAttempts: 0,
      createdAt: result.sentAt,
      updatedAt: result.sentAt,
    });
    await this.publishTimeline(tenantId, {
      id: newId(),
      companyId,
      occurredAt: result.sentAt,
      channel: 'mail',
      direction: 'outbound',
      actor: result.from,
      subjectType: 'mail',
      subjectId: result.id,
      title: result.subject,
      preview: result.body.length > 140 ? `${result.body.slice(0, 137)}…` : result.body,
      visibility: 'participants',
      visibilityKey: result.id,
    });
    for (const recipient of result.to) {
      if (recipient === result.from) continue;
      await this.notifications.record({
        tenantId,
        userId: recipient,
        title: `📧 Mail from ${displayName(result.from)}: ${result.subject}`,
        body: result.body.length > 120 ? `${result.body.slice(0, 117)}…` : result.body,
        category: 'mail',
        refType: 'mail.message',
        refId: result.id,
      });
    }
    return result;
  }

  async markMailRead(tenantId: string, username: string, mailId: string): Promise<void> {
    // Only sender and recipients can see a mail at all, so anyone else asking to mark it read is
    // probing for existence — concealed as a 404, like the channel reads.
    const mail = await this.mail.get(tenantId, mailId);
    const onEnvelope = mail?.participants.some((p) => p.userId === username) ?? false;
    if (!mail || (!onEnvelope && mail.fromUser !== username)) {
      throw new NotFoundException(`mail ${mailId} not found`);
    }
    await this.mail.markRead(tenantId, mailId, { userId: username }, new Date().toISOString());
  }

  /**
   * Index an activity on the Communication timeline.
   *
   * Failure here is logged, never thrown: the timeline is a projection, and losing a row from it
   * must not cost the user the message they actually sent. A dropped row is recoverable by
   * republishing from the owning record; a rejected send is not.
   */
  private async publishTimeline(tenantId: string, entry: TimelineEntry): Promise<void> {
    try {
      await this.store.publishTimeline(tenantId, entry);
    } catch (error) {
      this.logger.warn(`Timeline publish failed for ${entry.subjectType} ${entry.subjectId}: ${(error as Error).message}`);
    }
  }

  /** One badge feed: chat unread + mail unread (notifications count comes from its own endpoint). */
  async unread(tenantId: string, username: string, isAdmin: boolean, companyId: string | null = null): Promise<{ chat: number; mail: number }> {
    const summaries = await this.channels(tenantId, username, isAdmin, companyId);
    const box = await this.mailbox(tenantId, username);
    return { chat: summaries.reduce((sum, c) => sum + c.unread, 0), mail: box.unread };
  }
}
