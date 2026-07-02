import { describe, it, expect, afterEach, vi } from 'vitest';
import { NotificationService } from './notification.service';
import { InMemoryNotificationStore } from './notification-store';

const svc = () => new NotificationService(new InMemoryNotificationStore());

afterEach(() => {
  delete process.env.NOTIFY_CHANNELS;
  delete process.env.NOTIFY_FALLBACK_RECIPIENT;
  delete process.env.SMTP_RELAY_URL;
  vi.restoreAllMocks();
});

describe('NotificationService (notification center)', () => {
  it('records, lists newest-first, and tracks unread count', async () => {
    const s = svc();
    const a = await s.record({ tenantId: 't1', title: 'A', body: 'first', category: 'finance' });
    await s.record({ tenantId: 't1', title: 'B', body: 'second', category: 'procurement' });

    const list = await s.list({ tenantId: 't1' });
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe('B'); // newest first
    expect(await s.unreadCount('t1')).toBe(2);

    await s.markRead('t1', a.id);
    expect(await s.unreadCount('t1')).toBe(1);
    expect((await s.list({ tenantId: 't1', unreadOnly: true })).map((n) => n.title)).toEqual(['B']);
  });

  it('isolates by tenant', async () => {
    const s = svc();
    await s.record({ tenantId: 't1', title: 'X', body: 'x' });
    await s.record({ tenantId: 't2', title: 'Y', body: 'y' });
    expect(await s.unreadCount('t1')).toBe(1);
    expect((await s.list({ tenantId: 't2' })).map((n) => n.title)).toEqual(['Y']);
  });
});

describe('NotificationService (channel delivery)', () => {
  it('parses NOTIFY_CHANNELS csv, dropping unknown channels', () => {
    process.env.NOTIFY_CHANNELS = 'email, SMS, carrier-pigeon';
    expect(svc().defaultChannels()).toEqual(['email', 'sms']);
  });

  it('dispatches tenant-broadcast records via default channels to the fallback recipient', async () => {
    process.env.NOTIFY_CHANNELS = 'email';
    process.env.NOTIFY_FALLBACK_RECIPIENT = 'ops@example.com';
    const s = svc();
    const send = vi.spyOn(s, 'send');
    await s.record({ tenantId: 't1', title: 'SLA breach', body: 'ticket overdue' });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'ops@example.com', channels: ['email'] }),
    );
  });

  it('does not dispatch when no recipient can be resolved', async () => {
    process.env.NOTIFY_CHANNELS = 'email';
    const s = svc();
    const send = vi.spyOn(s, 'send');
    await s.record({ tenantId: 't1', title: 'X', body: 'x' }); // no userId, no fallback
    expect(send).not.toHaveBeenCalled();
  });

  it('reports logged without a transport and sent when the relay URL is set', async () => {
    const s = svc();
    const payload = { tenantId: 't1', userId: 'u1', title: 'T', body: 'B', channels: ['email'] as const };
    expect((await s.send({ ...payload, channels: [...payload.channels] }))[0]).toMatchObject({ success: true, delivered: 'logged' });

    process.env.SMTP_RELAY_URL = 'http://relay.local/send';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);
    expect((await s.send({ ...payload, channels: [...payload.channels] }))[0]).toMatchObject({ success: true, delivered: 'sent' });
    expect(fetchMock).toHaveBeenCalledWith('http://relay.local/send', expect.objectContaining({ method: 'POST' }));
  });
});
