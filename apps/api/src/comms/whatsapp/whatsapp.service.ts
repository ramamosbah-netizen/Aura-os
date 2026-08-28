import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { EventBus, NotificationService, TenantContext } from '@aura/core';
import { AccountService, ContactService } from '@aura/crm';
import { makeEvent, newId, normalizeWhatsAppPhone, type WhatsAppMessageType, type WhatsAppMessageStatus } from '@aura/shared';
import { COMMS_STORE, type CommsStore } from '../comms-store';
import { WhatsAppCloudProvider } from './whatsapp-cloud.provider';
import { WHATSAPP_STORE, type WhatsAppStore, type StoredWhatsAppThread } from './whatsapp-store';

type MetaWebhook = { entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string }; contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>; messages?: Array<Record<string, unknown>>; statuses?: Array<Record<string, unknown>> } }> }> };

function messageType(value: string | undefined): WhatsAppMessageType { return ['text','image','document','audio','video','sticker'].includes(value ?? '') ? value as WhatsAppMessageType : 'unknown'; }
function status(value: string | undefined): WhatsAppMessageStatus { return value === 'delivered' || value === 'read' || value === 'failed' || value === 'sent' ? value : 'sent'; }
function bodyOf(m: Record<string, unknown>): { body: string; mediaId: string | null; type: WhatsAppMessageType } {
  const type = messageType(typeof m.type === 'string' ? m.type : undefined); const payload = (m[type] ?? {}) as Record<string, unknown>;
  return { body: type === 'text' && typeof payload.body === 'string' ? payload.body : type === 'unknown' ? 'WhatsApp message' : `[${type}]`, mediaId: typeof payload.id === 'string' ? payload.id : null, type };
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger('WhatsApp');
  constructor(
    @Inject(WHATSAPP_STORE) private readonly store: WhatsAppStore,
    @Inject(COMMS_STORE) private readonly comms: CommsStore,
    private readonly provider: WhatsAppCloudProvider,
    private readonly notifications: NotificationService,
    private readonly events: EventBus,
    private readonly tenant: TenantContext,
    @Optional() @Inject(ContactService) private readonly contacts: ContactService | null = null,
    @Optional() @Inject(AccountService) private readonly accounts: AccountService | null = null,
  ) {}

  configured(): boolean { return this.provider.isConfigured(); }
  verify(query: { mode?: string; token?: string; challenge?: string }): string | null { return this.provider.verifyChallenge(query.mode, query.token, query.challenge); }

  async webhook(rawBody: Buffer, payload: MetaWebhook, signature?: string): Promise<{ received: true; processed: number }> {
    if (!this.provider.verifySignature(rawBody, signature)) throw new ForbiddenException('Invalid WhatsApp webhook signature');
    let processed = 0;
    for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
      const value = change.value; const externalAccountId = value?.metadata?.phone_number_id; if (!externalAccountId) continue;
      const account = await this.store.findProviderAccountByExternalAccountId(externalAccountId); if (!account) { this.logger.warn(`Ignoring webhook for unregistered phone number ${externalAccountId}`); continue; }
      for (const raw of value?.messages ?? []) { if (await this.inbound(account, value?.contacts ?? [], raw)) processed++; }
      for (const raw of value?.statuses ?? []) { if (await this.delivery(account.tenantId, account.id, raw)) processed++; }
    }
    return { received: true, processed };
  }

  private async inbound(account: { id: string; tenantId: string; companyId: string | null; ownerUserId: string | null }, contacts: Array<{ wa_id?: string; profile?: { name?: string } }>, raw: Record<string, unknown>): Promise<boolean> {
    const externalMessageId = typeof raw.id === 'string' ? raw.id : null; const from = typeof raw.from === 'string' ? normalizeWhatsAppPhone(raw.from) : ''; if (!from) return false;
    const contactMeta = contacts.find((c) => c.wa_id === raw.from); const displayName = contactMeta?.profile?.name?.trim() || from; let contactId: string | null = null; let accountId: string | null = null; let ownerId = account.ownerUserId;
    if (this.contacts) { const matches = await this.contacts.list({ tenantId: account.tenantId, status: 'active' }); const found = matches.find((c) => c.phone && normalizeWhatsAppPhone(c.phone) === from); if (found) { contactId = found.id; accountId = found.accountId; ownerId = found.ownerId ?? ownerId; } }
    const existing = await this.store.findThreadByPhone(account.tenantId, account.id, from);
    const thread = await this.store.ensureThread({ id: existing?.id ?? newId(), tenantId: account.tenantId, companyId: account.companyId, providerAccountId: account.id, channel: 'whatsapp', displayName, phone: from, externalConversationId: from, contactId: existing?.contactId ?? contactId, accountId: existing?.accountId ?? accountId, ownerId: existing?.ownerId ?? ownerId });
    const parsed = bodyOf(raw); const timestamp = typeof raw.timestamp === 'string' ? new Date(Number(raw.timestamp) * 1000).toISOString() : new Date().toISOString();
    const result = await this.store.insertMessage({ tenantId: account.tenantId, companyId: account.companyId, providerAccountId: account.id, threadId: thread.id, externalMessageId, direction: 'inbound', status: 'received', type: parsed.type, body: parsed.body, mediaId: parsed.mediaId, sender: from, occurredAt: timestamp, rawPayload: raw });
    if (!result.inserted) return false;
    await this.comms.publishTimeline(account.tenantId, { id: newId(), companyId: account.companyId, occurredAt: timestamp, channel: 'whatsapp', direction: 'inbound', actor: from, subjectType: 'whatsapp', subjectId: result.message.id, title: `WhatsApp from ${displayName}`, preview: parsed.body.slice(0, 240), visibility: 'tenant', visibilityKey: account.id });
    await this.notifications.record({ tenantId: account.tenantId, userId: thread.ownerId, title: `New WhatsApp message from ${displayName}`, body: parsed.body.slice(0, 240), category: 'chat', refType: 'comms.whatsapp', refId: thread.id });
    await this.events.publish(makeEvent({ type: 'comms.whatsapp.received', tenantId: account.tenantId, companyId: account.companyId, aggregateType: 'comms.whatsapp.message', aggregateId: result.message.id, actorId: from, payload: { threadId: thread.id, messageId: result.message.id } }));
    return true;
  }

  private async delivery(tenantId: string, providerAccountId: string, raw: Record<string, unknown>): Promise<boolean> {
    const id = typeof raw.id === 'string' ? raw.id : ''; if (!id) return false; const next = await this.store.updateStatus(tenantId, providerAccountId, id, status(typeof raw.status === 'string' ? raw.status : undefined), typeof raw.errors === 'string' ? raw.errors : null); if (!next) return false;
    if (next.status === 'read' && next.direction === 'outbound') await this.notifications.record({ tenantId, userId: next.sender, title: 'WhatsApp message read', body: `Your message to the customer was read.`, category: 'chat', refType: 'comms.whatsapp', refId: next.threadId });
    await this.events.publish(makeEvent({ type: 'comms.whatsapp.status', tenantId, companyId: next.companyId, aggregateType: 'comms.whatsapp.message', aggregateId: next.id, actorId: null, payload: { threadId: next.threadId, externalMessageId: id, status: next.status } })); return true;
  }

  async threads(tenantId: string, companyId: string | null, ownerId?: string | null): Promise<StoredWhatsAppThread[]> { return this.store.listThreads(tenantId, companyId, ownerId); }

  /** Resource-level authorization for WhatsApp conversations. Unassigned threads are claimable;
   * assigned threads are private to the assignee and tenant admins. */
  async isThreadVisible(tenantId: string, companyId: string | null, actorId: string, isAdmin: boolean, threadId: string): Promise<boolean> {
    const thread = await this.store.findThread(tenantId, threadId);
    return Boolean(thread && (companyId === null || thread.companyId === companyId) && (isAdmin || !thread.ownerId || thread.ownerId === actorId));
  }

  private async requireThread(tenantId: string, companyId: string | null, actorId: string, isAdmin: boolean, threadId: string): Promise<StoredWhatsAppThread> {
    const thread = await this.store.findThread(tenantId, threadId);
    if (!thread || (companyId !== null && thread.companyId !== companyId) || (!isAdmin && thread.ownerId && thread.ownerId !== actorId)) throw new NotFoundException('WhatsApp conversation not found');
    return thread;
  }

  async messages(tenantId: string, companyId: string | null, actorId: string, isAdmin: boolean, threadId: string): Promise<ReturnType<WhatsAppStore['listMessages']> extends Promise<infer T> ? T : never> { await this.requireThread(tenantId, companyId, actorId, isAdmin, threadId); return this.store.listMessages(tenantId, threadId); }

  async markRead(tenantId: string, companyId: string | null, actorId: string, isAdmin: boolean, threadId: string): Promise<void> {
    const thread = await this.requireThread(tenantId, companyId, actorId, isAdmin, threadId);
    const messages = await this.store.listMessages(tenantId, threadId);
    for (const message of messages.filter((candidate) => candidate.direction === 'inbound' && candidate.externalMessageId && candidate.status !== 'read')) {
      try { await this.provider.markRead(message.externalMessageId!); } catch (error) { this.logger.warn(`WhatsApp read receipt failed for ${message.id}: ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
    await this.store.markRead(tenantId, thread.id);
  }

  async reply(tenantId: string, companyId: string | null, sender: string, isAdmin: boolean, threadId: string, text: string) {
    const thread = await this.requireThread(tenantId, companyId, sender, isAdmin, threadId); const body = text.trim(); if (!body) throw new BadRequestException('Message text is required');
    const queued = await this.store.insertMessage({ tenantId, companyId: thread.companyId, providerAccountId: thread.providerAccountId, threadId, externalMessageId: null, direction: 'outbound', status: 'queued', type: 'text', body, sender, occurredAt: new Date().toISOString() });
    let updated = queued.message; let lastError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { const sent = await this.provider.sendText(thread.phone, body); updated = await this.store.setMessageDelivery(tenantId, queued.message.id, sent.externalMessageId || null, sent.status, sent.error) ?? updated; lastError = null; break; }
      catch (error) { lastError = error; if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 250)); }
    }
    if (lastError) updated = await this.store.setMessageDelivery(tenantId, queued.message.id, null, 'failed', lastError instanceof Error ? lastError.message : 'WhatsApp send failed') ?? updated;
    await this.comms.publishTimeline(tenantId, { id: newId(), companyId: thread.companyId, occurredAt: updated.occurredAt, channel: 'whatsapp', direction: 'outbound', actor: sender, subjectType: 'whatsapp', subjectId: updated.id, title: `WhatsApp reply to ${thread.displayName}`, preview: body.slice(0, 240), visibility: 'tenant', visibilityKey: thread.providerAccountId });
    return updated;
  }
  async link(tenantId: string, companyId: string | null, actorId: string, isAdmin: boolean, threadId: string, links: { contactId?: string | null; accountId?: string | null; ownerId?: string | null }) {
    const current = await this.requireThread(tenantId, companyId, actorId, isAdmin, threadId);
    if (!isAdmin && links.ownerId !== undefined && links.ownerId !== null && links.ownerId !== actorId) throw new ForbiddenException('Only an administrator may assign a WhatsApp conversation to another user');
    if (links.contactId && this.contacts) {
      const contact = await this.contacts.get(links.contactId);
      if (!contact || contact.tenantId !== tenantId || (companyId !== null && contact.companyId !== companyId)) throw new BadRequestException('Contact is not available in this company');
    }
    if (links.accountId && this.accounts) {
      const account = await this.accounts.get(links.accountId);
      if (!account || account.tenantId !== tenantId || (companyId !== null && account.companyId !== companyId)) throw new BadRequestException('Account is not available in this company');
    }
    return this.store.linkThread(tenantId, threadId, {
      contactId: links.contactId !== undefined ? links.contactId : current.contactId,
      accountId: links.accountId !== undefined ? links.accountId : current.accountId,
      ownerId: links.ownerId !== undefined ? links.ownerId : current.ownerId,
    });
  }
}
