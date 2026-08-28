import type { WhatsAppMessage, WhatsAppMessageStatus, WhatsAppThread } from '@aura/shared';

export interface WhatsAppProviderAccount {
  id: string;
  tenantId: string;
  companyId: string | null;
  externalAccountId: string;
  ownerUserId: string | null;
  displayLabel: string;
  status: string;
}

export interface StoredWhatsAppThread extends WhatsAppThread {
  tenantId: string;
  companyId: string | null;
  providerAccountId: string;
}

export interface StoredWhatsAppMessage extends WhatsAppMessage {
  tenantId: string;
  companyId: string | null;
  providerAccountId: string;
  rawPayload?: unknown;
}

export interface NewWhatsAppMessage {
  tenantId: string;
  companyId: string | null;
  providerAccountId: string;
  threadId: string;
  externalMessageId: string | null;
  direction: 'inbound' | 'outbound';
  status: WhatsAppMessageStatus;
  type: WhatsAppMessage['type'];
  body: string;
  mediaId?: string | null;
  sender: string;
  occurredAt: string;
  rawPayload?: unknown;
}

export const WHATSAPP_STORE = Symbol('WHATSAPP_STORE');

export interface WhatsAppStore {
  findProviderAccount(tenantId: string, externalAccountId: string): Promise<WhatsAppProviderAccount | null>;
  findProviderAccountByExternalAccountId(externalAccountId: string): Promise<WhatsAppProviderAccount | null>;
  findThread(tenantId: string, id: string): Promise<StoredWhatsAppThread | null>;
  findThreadByPhone(tenantId: string, providerAccountId: string, phone: string): Promise<StoredWhatsAppThread | null>;
  ensureThread(input: Omit<StoredWhatsAppThread, 'unread' | 'lastMessageAt' | 'lastPreview'> & Partial<Pick<StoredWhatsAppThread, 'unread' | 'lastMessageAt' | 'lastPreview'>>): Promise<StoredWhatsAppThread>;
  listThreads(tenantId: string, companyId: string | null, ownerId?: string | null): Promise<StoredWhatsAppThread[]>;
  listMessages(tenantId: string, threadId: string): Promise<StoredWhatsAppMessage[]>;
  getMessage(tenantId: string, messageId: string): Promise<StoredWhatsAppMessage | null>;
  findMessageByExternalId(tenantId: string, providerAccountId: string, externalMessageId: string): Promise<StoredWhatsAppMessage | null>;
  insertMessage(input: NewWhatsAppMessage): Promise<{ message: StoredWhatsAppMessage; inserted: boolean }>;
  updateStatus(tenantId: string, providerAccountId: string, externalMessageId: string, status: WhatsAppMessageStatus, failedReason?: string | null): Promise<StoredWhatsAppMessage | null>;
  setMessageDelivery(tenantId: string, messageId: string, externalMessageId: string | null, status: WhatsAppMessageStatus, failedReason?: string | null): Promise<StoredWhatsAppMessage | null>;
  markRead(tenantId: string, threadId: string): Promise<void>;
  linkThread(tenantId: string, threadId: string, links: { contactId?: string | null; accountId?: string | null; ownerId?: string | null }): Promise<StoredWhatsAppThread | null>;
}
