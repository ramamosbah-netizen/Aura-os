import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_STORE,
  type Notification,
  type NewNotification,
  type NotificationFilter,
  type NotificationStore,
  makeNotification,
} from './notification-store';

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

  constructor(@Inject(NOTIFICATION_STORE) private readonly store: NotificationStore) {}

  private endpointFor(channel: string): string | undefined {
    const env = process.env;
    if (channel === 'email') return env.SMTP_RELAY_URL;
    if (channel === 'sms') return env.SMS_RELAY_URL;
    if (channel === 'slack') return env.SLACK_WEBHOOK_URL;
    if (channel === 'teams') return env.TEAMS_WEBHOOK_URL;
    return undefined;
  }

  /** Persist a notification (the inbox record) and best-effort dispatch to channels. */
  async record(input: NewNotification, channels: NotificationPayload['channels'] = []): Promise<Notification> {
    const n = makeNotification(input);
    await this.store.save(n);
    if (channels.length && n.userId) {
      await this.send({ tenantId: n.tenantId, userId: n.userId, title: n.title, body: n.body, channels });
    }
    return n;
  }

  list(filter: NotificationFilter): Promise<Notification[]> {
    return this.store.list(filter);
  }

  markRead(tenantId: string, id: string): Promise<void> {
    return this.store.markRead(tenantId, id);
  }

  unreadCount(tenantId: string): Promise<number> {
    return this.store.unreadCount(tenantId);
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
