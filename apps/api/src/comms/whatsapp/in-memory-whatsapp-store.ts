import { newId, normalizeWhatsAppPhone, type WhatsAppMessageStatus } from '@aura/shared';
import type { NewWhatsAppMessage, StoredWhatsAppMessage, StoredWhatsAppThread, WhatsAppProviderAccount, WhatsAppStore } from './whatsapp-store';

export class InMemoryWhatsAppStore implements WhatsAppStore {
  private readonly accounts = new Map<string, WhatsAppProviderAccount>();
  private readonly threads = new Map<string, StoredWhatsAppThread>();
  private readonly messages = new Map<string, StoredWhatsAppMessage>();

  constructor() {
    const external = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (external) this.accounts.set(external, { id: 'whatsapp-dev-account', tenantId: 'dev-tenant', companyId: null, externalAccountId: external, ownerUserId: null, displayLabel: 'WhatsApp Business', status: 'connected' });
  }
  async findProviderAccount(tenantId: string, externalAccountId: string) {
    const row = this.accounts.get(externalAccountId);
    return row?.tenantId === tenantId ? row : null;
  }
  async findProviderAccountByExternalAccountId(externalAccountId: string) { return this.accounts.get(externalAccountId) ?? null; }
  async findThread(tenantId: string, id: string) { const row = this.threads.get(id); return row?.tenantId === tenantId ? { ...row } : null; }
  async findThreadByPhone(tenantId: string, providerAccountId: string, phone: string) {
    const normalized = normalizeWhatsAppPhone(phone);
    return [...this.threads.values()].find((t) => t.tenantId === tenantId && t.providerAccountId === providerAccountId && t.phone === normalized) ?? null;
  }
  async ensureThread(input: Omit<StoredWhatsAppThread, 'unread' | 'lastMessageAt' | 'lastPreview'> & Partial<Pick<StoredWhatsAppThread, 'unread' | 'lastMessageAt' | 'lastPreview'>>) {
    const existing = await this.findThreadByPhone(input.tenantId, input.providerAccountId, input.phone);
    if (existing) return { ...existing, displayName: input.displayName || existing.displayName };
    const row = { ...input, unread: input.unread ?? 0, lastMessageAt: input.lastMessageAt ?? null, lastPreview: input.lastPreview ?? null };
    this.threads.set(row.id, row);
    return { ...row };
  }
  async listThreads(tenantId: string, companyId: string | null, ownerId?: string | null) {
    return [...this.threads.values()].filter((t) => t.tenantId === tenantId && (companyId === null || t.companyId === companyId) && (!ownerId || !t.ownerId || t.ownerId === ownerId)).sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
  }
  async listMessages(tenantId: string, threadId: string) { return [...this.messages.values()].filter((m) => m.tenantId === tenantId && m.threadId === threadId).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)); }
  async getMessage(tenantId: string, messageId: string) { const row = this.messages.get(messageId); return row?.tenantId === tenantId ? { ...row } : null; }
  async findMessageByExternalId(tenantId: string, providerAccountId: string, externalMessageId: string) { const row = [...this.messages.values()].find((m) => m.tenantId === tenantId && m.providerAccountId === providerAccountId && m.externalMessageId === externalMessageId); return row ? { ...row } : null; }
  async insertMessage(input: NewWhatsAppMessage) {
    if (input.externalMessageId) {
      const duplicate = [...this.messages.values()].find((m) => m.tenantId === input.tenantId && m.providerAccountId === input.providerAccountId && m.externalMessageId === input.externalMessageId);
      if (duplicate) return { message: { ...duplicate }, inserted: false };
    }
    const message: StoredWhatsAppMessage = { id: newId(), ...input, externalMessageId: input.externalMessageId, mediaId: input.mediaId ?? null, failedReason: null };
    this.messages.set(message.id, message);
    const thread = this.threads.get(input.threadId);
    if (thread) this.threads.set(thread.id, { ...thread, unread: input.direction === 'inbound' ? thread.unread + 1 : thread.unread, lastMessageAt: input.occurredAt, lastPreview: input.body.slice(0, 240) });
    return { message, inserted: true };
  }
  async updateStatus(tenantId: string, providerAccountId: string, externalMessageId: string, status: WhatsAppMessageStatus, failedReason: string | null = null) {
    const row = [...this.messages.values()].find((m) => m.tenantId === tenantId && m.providerAccountId === providerAccountId && m.externalMessageId === externalMessageId);
    if (!row) return null;
    const rank: Record<WhatsAppMessageStatus, number> = { received: 0, queued: 1, sent: 2, delivered: 3, read: 4, failed: 5 };
    const nextStatus = rank[status] < rank[row.status] && row.status !== 'failed' ? row.status : status;
    const updated = { ...row, status: nextStatus, failedReason }; this.messages.set(row.id, updated); return updated;
  }
  async setMessageDelivery(tenantId: string, messageId: string, externalMessageId: string | null, status: WhatsAppMessageStatus, failedReason: string | null = null) { const row = this.messages.get(messageId); if (!row || row.tenantId !== tenantId) return null; const updated = { ...row, externalMessageId, status, failedReason }; this.messages.set(messageId, updated); return updated; }
  async markRead(tenantId: string, threadId: string) {
    const row = this.threads.get(threadId); if (row?.tenantId === tenantId) this.threads.set(threadId, { ...row, unread: 0 });
  }
  async linkThread(tenantId: string, threadId: string, links: { contactId?: string | null; accountId?: string | null; ownerId?: string | null }) {
    const row = this.threads.get(threadId); if (!row || row.tenantId !== tenantId) return null;
    const updated = { ...row, ...links }; this.threads.set(threadId, updated); return updated;
  }
}
