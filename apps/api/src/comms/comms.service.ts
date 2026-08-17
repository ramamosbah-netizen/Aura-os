import { Inject, Injectable, Logger } from '@nestjs/common';
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
  unreadChatCount,
  visibleChannels,
} from '@aura/shared';
import { WorkspaceConfigService } from '../workspace/workspace-config.service';
import { COMMS_STORE, type CommsStore } from './comms-store';

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
  ) {}

  /**
   * Assert the directory channels exist, once per process per tenant. `ensureChannels` is an
   * upsert, so this adds a channel a new department earned without touching the messages already
   * in the ones that existed — which is what makes a restart invisible to users.
   */
  private async channelsFor(tenantId: string): Promise<ChatChannel[]> {
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
  async channels(tenantId: string, username: string, isAdmin: boolean): Promise<ChannelSummary[]> {
    const all = await this.channelsFor(tenantId);
    const visible = visibleChannels(all, username, isAdmin);
    const withDms = [
      ...visible,
      ...all.filter((c) => c.kind === 'dm' && c.members.includes(username) && !visible.includes(c)),
    ];
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
  async openDm(tenantId: string, me: string, peer: string): Promise<ChatChannel> {
    const id = dmChannelId(me, peer);
    const existing = await this.store.getChannel(tenantId, id);
    if (existing) return existing;
    const channel: ChatChannel = { id, kind: 'dm', name: displayName(peer), members: [me, peer].sort() };
    await this.store.ensureChannels(tenantId, [channel], me);
    return channel;
  }

  /** Messages in a channel (marks the channel read for the caller). */
  async messages(tenantId: string, username: string, channelId: string): Promise<ChatMessage[]> {
    const msgs = await this.store.listMessages(tenantId, channelId);
    await this.store.setLastRead(tenantId, channelId, username, new Date().toISOString());
    return msgs;
  }

  /** Post a message; notifies the DM peer (chat notifications stay lightweight). */
  async post(tenantId: string, input: NewChatMessage, companyId: string | null = null): Promise<ChatMessage | { error: string }> {
    const result = makeChatMessage(input);
    if ('error' in result) return result;
    await this.store.addMessage(tenantId, companyId, result);
    // Your own message never counts as unread to you.
    await this.store.setLastRead(tenantId, result.channelId, input.sender, result.sentAt);

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
    return mailboxFor(await this.store.listMailFor(tenantId, username), username);
  }

  /** Send internal mail — every recipient gets a notification. */
  async sendMail(tenantId: string, input: NewMail, companyId: string | null = null): Promise<MailMessage | { error: string }> {
    const result = makeMail(input);
    if ('error' in result) return result;
    // A root mail is its own thread. Reply/forward edges are populated in C3; the columns exist
    // now so threading is never retrofitted onto mail that was already sent.
    await this.store.addMail(tenantId, companyId, result, {
      threadId: result.id, parentMailId: null, forwardedFromMailId: null,
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
    await this.store.markMailRead(tenantId, mailId, username, new Date().toISOString());
  }

  /** One badge feed: chat unread + mail unread (notifications count comes from its own endpoint). */
  async unread(tenantId: string, username: string, isAdmin: boolean): Promise<{ chat: number; mail: number }> {
    const summaries = await this.channels(tenantId, username, isAdmin);
    const box = await this.mailbox(tenantId, username);
    return { chat: summaries.reduce((sum, c) => sum + c.unread, 0), mail: box.unread };
  }
}
