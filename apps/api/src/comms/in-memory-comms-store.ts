import type { ChatChannel, ChatMessage } from '@aura/shared';
import type { CommsStore, StoredChannel, TimelineEntry } from './comms-store';

interface TenantRows {
  channels: Map<string, StoredChannel>;
  messages: Map<string, ChatMessage[]>;
  lastRead: Map<string, string>;
  timeline: Map<string, TimelineEntry>;
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
      t = { channels: new Map(), messages: new Map(), lastRead: new Map(), timeline: new Map() };
      this.tenants.set(tenantId, t);
    }
    return t;
  }

  async listChannels(tenantId: string): Promise<StoredChannel[]> {
    return [...this.rows(tenantId).channels.values()];
  }

  async ensureChannels(tenantId: string, channels: ChatChannel[], _createdBy = 'system', companyId: string | null = null): Promise<void> {
    const t = this.rows(tenantId);
    for (const channel of channels) if (!t.channels.has(channel.id)) t.channels.set(channel.id, { ...channel, companyId });
  }

  async getChannel(tenantId: string, channelId: string): Promise<StoredChannel | null> {
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




  async publishTimeline(tenantId: string, entry: TimelineEntry): Promise<void> {
    // Keyed by subject so a republish overwrites rather than duplicates, mirroring the unique
    // index the Postgres store relies on.
    this.rows(tenantId).timeline.set(`${entry.subjectType}::${entry.subjectId}`, entry);
  }

  /** Read side used by the timeline tests; the Overview query lands in a later slice. */
  async listTimeline(tenantId: string): Promise<TimelineEntry[]> {
    return [...this.rows(tenantId).timeline.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

}
