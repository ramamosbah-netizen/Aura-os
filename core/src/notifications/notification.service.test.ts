import { describe, it, expect } from 'vitest';
import { NotificationService } from './notification.service';
import { InMemoryNotificationStore } from './notification-store';

const svc = () => new NotificationService(new InMemoryNotificationStore());

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
