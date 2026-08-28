import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import crypto from 'node:crypto';

export interface WhatsAppSendResult { externalMessageId: string; status: 'sent' | 'failed'; error?: string }

@Injectable()
export class WhatsAppCloudProvider {
  private readonly version = process.env.WHATSAPP_API_VERSION ?? 'v23.0';
  private readonly token = process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? '';
  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? '';
  private readonly appSecret = process.env.WHATSAPP_APP_SECRET?.trim() ?? '';
  private readonly verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ?? '';

  isConfigured(): boolean { return Boolean(this.token && this.phoneNumberId && this.appSecret && this.verifyToken); }
  accountId(): string { return this.phoneNumberId; }
  verifyChallenge(mode: string | undefined, token: string | undefined, challenge: string | undefined): string | null {
    return mode === 'subscribe' && token && challenge && this.verifyToken && token === this.verifyToken ? challenge : null;
  }
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!this.appSecret || !signature?.startsWith('sha256=')) return false;
    const expected = `sha256=${crypto.createHmac('sha256', this.appSecret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(expected); const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  async sendText(to: string, body: string): Promise<WhatsAppSendResult> {
    if (!this.token || !this.phoneNumberId) throw new ServiceUnavailableException('WhatsApp Business is not configured');
    const response = await this.request({ messaging_product: 'whatsapp', recipient_type: 'individual', to: to.replace(/^\+/, ''), type: 'text', text: { preview_url: false, body } });
    const data = await response.json().catch(() => ({})) as { messages?: Array<{ id?: string }>; error?: { message?: string } };
    if (!response.ok || !data.messages?.[0]?.id) return { externalMessageId: '', status: 'failed', error: data.error?.message ?? `WhatsApp API HTTP ${response.status}` };
    return { externalMessageId: data.messages[0].id, status: 'sent' };
  }

  /** A read receipt is a separate Cloud API operation from the local AURA read state. */
  async markRead(messageId: string): Promise<void> {
    if (!this.token || !this.phoneNumberId) throw new ServiceUnavailableException('WhatsApp Business is not configured');
    const response = await this.request({ messaging_product: 'whatsapp', status: 'read', message_id: messageId });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(data.error?.message ?? `WhatsApp read receipt HTTP ${response.status}`);
    }
  }

  private async request(body: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      return await fetch(`https://graph.facebook.com/${this.version}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
