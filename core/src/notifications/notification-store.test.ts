import { describe, expect, it, vi } from 'vitest';
import { InMemoryNotificationStore, PostgresNotificationStore, makeNotification } from './notification-store';

/**
 * A notification addressed to one person is listed to that person and nobody else; one addressed
 * to nobody is a tenant-wide notice. The PostgreSQL list ignored the user filter, so every user saw
 * everyone else's personal notifications (found proving INT-03's "the assignee receives it once").
 */
describe('notification list — addressed notifications stay with their addressee', () => {
  it('filters by user on PostgreSQL, as markRead and unreadCount already did', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = new PostgresNotificationStore({ query } as never);
    await store.list({ tenantId: 't1', userId: 'u-sales', limit: 50 });
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('AND (user_id IS NULL OR user_id = $2)');
    expect(params).toEqual(['t1', 'u-sales', 50]);
  });

  it('agrees with the in-memory store', async () => {
    const store = new InMemoryNotificationStore();
    await store.save(makeNotification({ tenantId: 't1', userId: 'u-sales', title: 'Lead assigned to you', body: '' }));
    await store.save(makeNotification({ tenantId: 't1', userId: null, title: 'Tender won', body: '' }));
    expect((await store.list({ tenantId: 't1', userId: 'u-presales' })).map((n) => n.title)).toEqual(['Tender won']);
    expect((await store.list({ tenantId: 't1', userId: 'u-sales' })).map((n) => n.title).sort()).toEqual(['Lead assigned to you', 'Tender won']);
  });
});
