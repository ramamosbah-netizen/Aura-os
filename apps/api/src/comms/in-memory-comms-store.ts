import type { ChatChannel, ChatMessage, MailMessage } from '@aura/shared';
import type { CommsStore } from './comms-store';

interface TenantRows {
  channels: Map<string, ChatChannel>;
  messages: Map<string, ChatMessage[]>;
  lastRead: Map<string, string>;
  mail: MailMessage[];
}

/**
 * In-memory stand-in so the API boots and the test suite runs without a database — the same
 * arrangement every other AURA store uses. It is NOT the production path: without DATABASE_URL
 * communication is still lost on restart, which is exactly the behaviour C1 replaces in Postgres.
 */
export class InMemoryCommsStore implements CommsStore {
  private readonly tenants = new Map<string, TenantRows>();

  private rows(tenantId: string): TenantRows {
    let t = this.tenants.get(tenantId);
    if (!t) {
      t = { channels: new Map(), messages: new Map(), lastRead: new Map(), mail: [] };
      this.tenants.set(tenantId, t);
    }
    return t;
  }

  async listChannels(tenantId: string): Promise<ChatChannel[]> {
    return [...this.rows(tenantId).channels.values()];
  }

  async ensureChannels(tenantId: string, channels: ChatChannel[]): Promise<void> {
    const t = this.rows(tenantId);
    for (const channel of channels) if (!t.channels.has(channel.id)) t.channels.set(channel.id, channel);
  }

  async getChannel(tenantId: string, channelId: string): Promise<ChatChannel | null> {
    return this.rows(tenantId).channels.get(channelId) ?? null;
  }

  async listMessages(tenantId: string, channelId: string): Promise<ChatMessage[]> {
    return [...(this.rows(tenantId).messages.get(channelId) ?? [])];
  }

  async addMessage(tenantId: string, _companyId: string | null, message: ChatMessage): Promise<void> {
    const t = this.rows(tenantId);
    t.messages.set(message.channelId, [...(t.messages.get(message.channelId) ?? []), message]);
  }

  async getLastRead(tenantId: string, channelId: string, username: string): Promise<string | null> {
    return this.rows(tenantId).lastRead.get(`${channelId}::${username}`) ?? null;
  }

  async setLastRead(tenantId: string, channelId: string, username: string, at: string): Promise<void> {
    this.rows(tenantId).lastRead.set(`${channelId}::${username}`, at);
  }

  async listMailFor(tenantId: string, username: string): Promise<MailMessage[]> {
    return this.rows(tenantId).mail.filter((m) => m.from === username || m.to.includes(username));
  }

  async getMail(tenantId: string, mailId: string): Promise<MailMessage | null> {
    return this.rows(tenantId).mail.find((m) => m.id === mailId) ?? null;
  }

  async addMail(tenantId: string, _companyId: string | null, mail: MailMessage): Promise<void> {
    this.rows(tenantId).mail.push(mail);
  }

  async markMailRead(tenantId: string, mailId: string, username: string): Promise<void> {
    const mail = this.rows(tenantId).mail.find((m) => m.id === mailId);
    // Only a recipient has anything to mark: the sender's copy is read by construction.
    if (mail && mail.to.includes(username) && !mail.readBy.includes(username)) mail.readBy.push(username);
  }
}
