/** Provider-neutral WhatsApp Cloud API types and pure helpers. */
export type WhatsAppDirection = 'inbound' | 'outbound';
export type WhatsAppMessageStatus = 'received' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
export type WhatsAppMessageType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'unknown';

export interface WhatsAppThread {
  id: string;
  channel: 'whatsapp';
  displayName: string;
  phone: string;
  externalConversationId: string | null;
  contactId: string | null;
  accountId: string | null;
  ownerId: string | null;
  unread: number;
  lastMessageAt: string | null;
  lastPreview: string | null;
}

export interface WhatsAppMessage {
  id: string;
  threadId: string;
  externalMessageId: string | null;
  direction: WhatsAppDirection;
  status: WhatsAppMessageStatus;
  type: WhatsAppMessageType;
  body: string;
  mediaId: string | null;
  failedReason: string | null;
  sender: string;
  occurredAt: string;
}

/** Keep a phone number deterministic for matching; full country-code validation belongs to Meta. */
export function normalizeWhatsAppPhone(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  return `+${trimmed.replace(/\D/g, '')}`;
}

export function whatsappHref(phone: string, text?: string): string {
  const digits = normalizeWhatsAppPhone(phone).replace(/^\+/, '');
  const query = text?.trim() ? `?text=${encodeURIComponent(text.trim())}` : '';
  return `https://wa.me/${digits}${query}`;
}
