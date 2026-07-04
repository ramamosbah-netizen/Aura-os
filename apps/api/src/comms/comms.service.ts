import { Injectable, Logger } from '@nestjs/common';
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

interface TenantComms {
  channels: ChatChannel[];
  /** channelId → messages (ascending sentAt) */
  messages: Map<string, ChatMessage[]>;
  /** `${username}:${channelId}` → lastReadAt ISO */
  lastRead: Map<string, string>;
  mail: MailMessage[];
}

export interface ChannelSummary extends ChatChannel {
  unread: number;
  lastMessageAt: string | null;
  lastPreview: string | null;
}

/**
 * Team chat + internal mail, tenant-scoped. In-memory store (dev parity with the
 * other module stores); channels are seeded from the workspace directory so the
 * org structure (company / departments) matches the admin-configured roles.
 * Every chat message and mail emits a notification for its recipients — the
 * notification center is the single "everything" feed.
 */
@Injectable()
export class CommsService {
  private readonly logger = new Logger('Comms');
  private readonly tenants = new Map<string, TenantComms>();

  constructor(
    private readonly workspace: WorkspaceConfigService,
    private readonly notifications: NotificationService,
  ) {}

  private async tenant(tenantId: string): Promise<TenantComms> {
    let t = this.tenants.get(tenantId);
    if (!t) {
      const config = await this.workspace.get(tenantId);
      t = {
        channels: defaultChannelsForDirectory(config.assignments),
        messages: new Map(),
        lastRead: new Map(),
        mail: [],
      };
      this.tenants.set(tenantId, t);
      this.logger.log(`Seeded ${t.channels.length} chat channels for ${tenantId} from the workspace directory.`);
    }
    return t;
  }

  private preview(m: ChatMessage): string {
    if (m.kind === 'voice') return '🎤 Voice message';
    if (m.kind === 'file') return `📎 ${m.attachment?.name ?? 'Attachment'}`;
    return m.text.length > 80 ? `${m.text.slice(0, 77)}…` : m.text;
  }

  /** Channels the user can see, with unread counts — DMs appear once used. */
  async channels(tenantId: string, username: string, isAdmin: boolean): Promise<ChannelSummary[]> {
    const t = await this.tenant(tenantId);
    const visible = visibleChannels(t.channels, username, isAdmin);
    const withDms = [
      ...visible,
      ...t.channels.filter((c) => c.kind === 'dm' && c.members.includes(username) && !visible.includes(c)),
    ];
    return withDms.map((c) => {
      const msgs = t.messages.get(c.id) ?? [];
      const last = msgs[msgs.length - 1] ?? null;
      return {
        ...c,
        unread: unreadChatCount(msgs, username, t.lastRead.get(`${username}:${c.id}`) ?? null),
        lastMessageAt: last?.sentAt ?? null,
        lastPreview: last ? this.preview(last) : null,
      };
    });
  }

  /** Open (or create) the DM channel between two users. */
  async openDm(tenantId: string, me: string, peer: string): Promise<ChatChannel> {
    const t = await this.tenant(tenantId);
    const id = dmChannelId(me, peer);
    let ch = t.channels.find((c) => c.id === id);
    if (!ch) {
      ch = { id, kind: 'dm', name: displayName(peer), members: [me, peer].sort() };
      t.channels.push(ch);
    }
    return ch;
  }

  /** Messages in a channel (marks the channel read for the caller). */
  async messages(tenantId: string, username: string, channelId: string): Promise<ChatMessage[]> {
    const t = await this.tenant(tenantId);
    const msgs = t.messages.get(channelId) ?? [];
    t.lastRead.set(`${username}:${channelId}`, new Date().toISOString());
    return msgs;
  }

  /** Post a message; notifies the DM peer (chat notifications stay lightweight). */
  async post(tenantId: string, input: NewChatMessage): Promise<ChatMessage | { error: string }> {
    const t = await this.tenant(tenantId);
    const result = makeChatMessage(input);
    if ('error' in result) return result;
    const list = t.messages.get(result.channelId) ?? [];
    list.push(result);
    t.messages.set(result.channelId, list);
    t.lastRead.set(`${input.sender}:${result.channelId}`, result.sentAt);

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
    const t = await this.tenant(tenantId);
    return mailboxFor(t.mail, username);
  }

  /** Send internal mail — every recipient gets a notification. */
  async sendMail(tenantId: string, input: NewMail): Promise<MailMessage | { error: string }> {
    const t = await this.tenant(tenantId);
    const result = makeMail(input);
    if ('error' in result) return result;
    t.mail.push(result);
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
    const t = await this.tenant(tenantId);
    const mail = t.mail.find((m) => m.id === mailId);
    if (mail && !mail.readBy.includes(username)) mail.readBy.push(username);
  }

  /** One badge feed: chat unread + mail unread (notifications count comes from its own endpoint). */
  async unread(tenantId: string, username: string, isAdmin: boolean): Promise<{ chat: number; mail: number }> {
    const summaries = await this.channels(tenantId, username, isAdmin);
    const box = await this.mailbox(tenantId, username);
    return { chat: summaries.reduce((sum, c) => sum + c.unread, 0), mail: box.unread };
  }
}
