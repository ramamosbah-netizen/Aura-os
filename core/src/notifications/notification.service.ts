import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  NOTIFICATION_STORE,
  type Notification,
  type NewNotification,
  type NotificationFilter,
  type NotificationStore,
  makeNotification,
} from './notification-store';
import { SettingsService } from '../config/settings.service';

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

const CHANNELS = ['email', 'sms', 'slack', 'teams'] as const;
type Channel = (typeof CHANNELS)[number];

/**
 * Notification delivery. Real delivery is config-gated per channel (mirrors the AI provider seam):
 *   email → POST SMTP_RELAY_URL · sms → POST SMS_RELAY_URL · slack → SLACK_WEBHOOK_URL · teams → TEAMS_WEBHOOK_URL.
 * When the channel's endpoint env is unset, it logs (dev fallback) and reports delivered:'logged'.
 *
 * Event-raised (tenant-broadcast) notifications carry no userId and no explicit channels;
 * NOTIFY_CHANNELS (csv) supplies default channels and NOTIFY_FALLBACK_RECIPIENT the
 * tenant-level recipient (e.g. an ops distribution address) so they still deliver.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger('NotificationService');

  constructor(
    @Inject(NOTIFICATION_STORE) private readonly store: NotificationStore,
    // Tenant-editable routing (Admin Center §2.8): notify.channels / notify.recipients /
    // notify.fallbackRecipient settings override the env defaults when present.
    @Optional() private readonly settings: SettingsService | null = null,
  ) {}

  /** A tenant routing setting, or null (no settings service / key unset / lookup failed). */
  private async routingSetting(tenantId: string, key: string): Promise<string | null> {
    if (!this.settings) return null;
    try {
      const v = await this.settings.get(tenantId, key);
      return v?.trim() ? v.trim() : null;
    } catch {
      return null;
    }
  }

  private endpointFor(channel: string): string | undefined {
    const env = process.env;
    if (channel === 'email') return env.SMTP_RELAY_URL;
    if (channel === 'sms') return env.SMS_RELAY_URL;
    if (channel === 'slack') return env.SLACK_WEBHOOK_URL;
    if (channel === 'teams') return env.TEAMS_WEBHOOK_URL;
    return undefined;
  }

  /** Parse a channels csv, dropping unknown channel names. */
  parseChannels(csv: string | undefined | null): Channel[] {
    return (csv ?? '')
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c));
  }

  /** Default channels for notifications recorded without explicit channels (NOTIFY_CHANNELS csv). */
  defaultChannels(): Channel[] {
    return this.parseChannels(process.env.NOTIFY_CHANNELS);
  }

  /**
   * Resolve a userId to a deliverable address (gap #11 — per-user recipient resolution):
   * 1. `NOTIFY_RECIPIENTS` csv map (`u-finance=fin@co.com,u-admin=+97150...`) wins;
   * 2. a userId that already looks like an email or E.164 phone passes through as-is;
   * 3. otherwise the tenant-level `NOTIFY_FALLBACK_RECIPIENT` (ops distribution address).
   */
  resolveRecipient(
    userId: string | null,
    mapCsv: string | undefined = process.env.NOTIFY_RECIPIENTS,
    fallbackAddr: string | undefined = process.env.NOTIFY_FALLBACK_RECIPIENT,
  ): string | null {
    const fallback = fallbackAddr?.trim() || null;
    if (!userId) return fallback;
    for (const pair of (mapCsv ?? '').split(',')) {
      const i = pair.indexOf('=');
      if (i > 0 && pair.slice(0, i).trim() === userId) return pair.slice(i + 1).trim() || fallback;
    }
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(userId) || /^\+?[0-9]{7,15}$/.test(userId)) return userId;
    return fallback;
  }

  /** Persist a notification (the inbox record) and best-effort dispatch to channels. */
  async record(input: NewNotification, channels: NotificationPayload['channels'] = []): Promise<Notification> {
    const n = makeNotification(input);
    await this.store.save(n);

    // Routing (Admin Center §2.8): tenant settings win, env is the fallback.
    const [chSetting, mapSetting, fbSetting] = await Promise.all([
      this.routingSetting(n.tenantId, 'notify.channels'),
      this.routingSetting(n.tenantId, 'notify.recipients'),
      this.routingSetting(n.tenantId, 'notify.fallbackRecipient'),
    ]);
    const resolved = channels.length
      ? channels
      : chSetting !== null
        ? this.parseChannels(chSetting)
        : this.defaultChannels();
    const recipient = this.resolveRecipient(
      n.userId ?? null,
      mapSetting ?? process.env.NOTIFY_RECIPIENTS,
      fbSetting ?? process.env.NOTIFY_FALLBACK_RECIPIENT,
    );
    if (resolved.length && recipient) {
      await this.send({ tenantId: n.tenantId, userId: recipient, title: n.title, body: n.body, channels: resolved });
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
