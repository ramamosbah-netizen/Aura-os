import { Injectable, Logger } from '@nestjs/common';

export interface NotificationPayload {
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  channels: Array<'email' | 'sms' | 'slack' | 'teams'>;
  meta?: Record<string, any>;
}

export interface DispatchResult {
  channel: string;
  success: boolean;
  /** 'sent' = delivered to a configured transport; 'logged' = no transport configured (dev fallback). */
  delivered: 'sent' | 'logged';
  error?: string;
}

/**
 * Notification delivery. Real delivery is config-gated per channel (mirrors the AI provider seam):
 *   email → POST SMTP_RELAY_URL · sms → POST SMS_RELAY_URL · slack → SLACK_WEBHOOK_URL · teams → TEAMS_WEBHOOK_URL.
 * When the channel's endpoint env is unset, it logs (dev fallback) and reports delivered:'logged'.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger('NotificationService');

  private endpointFor(channel: string): string | undefined {
    const env = process.env;
    if (channel === 'email') return env.SMTP_RELAY_URL;
    if (channel === 'sms') return env.SMS_RELAY_URL;
    if (channel === 'slack') return env.SLACK_WEBHOOK_URL;
    if (channel === 'teams') return env.TEAMS_WEBHOOK_URL;
    return undefined;
  }

  async send(payload: NotificationPayload): Promise<DispatchResult[]> {
    this.logger.log(`Dispatching notification to user ${payload.userId} (tenant ${payload.tenantId}): "${payload.title}"`);
    return Promise.all(payload.channels.map((channel) => this.dispatchToChannel(channel, payload)));
  }

  private async dispatchToChannel(channel: 'email' | 'sms' | 'slack' | 'teams', payload: NotificationPayload): Promise<DispatchResult> {
    if (!['email', 'sms', 'slack', 'teams'].includes(channel)) {
      return { channel, success: false, delivered: 'logged', error: `Unsupported channel: ${channel}` };
    }
    const url = this.endpointFor(channel);
    if (!url) {
      this.logger.debug(`[${channel.toUpperCase()} — no transport configured] "${payload.title}" → ${payload.userId}`);
      return { channel, success: true, delivered: 'logged' };
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: payload.userId, tenantId: payload.tenantId, title: payload.title, text: payload.body, meta: payload.meta }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { channel, success: true, delivered: 'sent' };
    } catch (err) {
      this.logger.error(`Failed to send via ${channel}: ${(err as Error).message}`);
      return { channel, success: false, delivered: 'sent', error: (err as Error).message };
    }
  }
}
