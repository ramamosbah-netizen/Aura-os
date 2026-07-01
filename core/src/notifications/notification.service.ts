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
  error?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger('NotificationService');

  constructor(@Inject(NOTIFICATION_STORE) private readonly store: NotificationStore) {}

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
    
    const dispatches = payload.channels.map(async (channel) => {
      try {
        await this.dispatchToChannel(channel, payload);
        return { channel, success: true };
      } catch (err: any) {
        this.logger.error(`Failed to send via ${channel}: ${err.message}`);
        return { channel, success: false, error: err.message };
      }
    });

    return Promise.all(dispatches);
  }

  private async dispatchToChannel(channel: 'email' | 'sms' | 'slack' | 'teams', payload: NotificationPayload): Promise<void> {
    // Simulate real integrations (Twilio, Sendgrid, Slack Webhooks)
    switch (channel) {
      case 'email':
        this.logger.debug(`[EMAIL SENDER] To: ${payload.userId} | Subject: ${payload.title} | Body: ${payload.body}`);
        break;
      case 'sms':
        this.logger.debug(`[SMS GATEWAY] To: ${payload.userId} | Message: ${payload.body}`);
        break;
      case 'slack':
        this.logger.debug(`[SLACK INCOMING WEBHOOK] Triggered for: ${payload.title}`);
        break;
      case 'teams':
        this.logger.debug(`[TEAMS CONNECTOR] Triggered for: ${payload.title}`);
        break;
      default:
        throw new Error(`Unsupported notification channel: ${channel}`);
    }
  }
}
