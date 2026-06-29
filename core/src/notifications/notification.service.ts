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
  error?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger('NotificationService');

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
