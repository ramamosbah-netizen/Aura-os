import { describe, expect, it } from 'vitest';
import { makeActivity, type Activity } from './domain/activity';
import { InMemoryActivityStore } from './in-memory-activity-store';

const activity = (overrides: Partial<Activity>): Activity => ({
  ...makeActivity({ tenantId: 'tenant-a', type: 'note', subject: 'Base activity' }),
  ...overrides,
});

describe('Activity query contract', () => {
  it('searches before pagination and keeps tenant-scoped page metadata', async () => {
    const store = new InMemoryActivityStore();
    await store.save(activity({ id: 'a1', subject: 'Falcon quotation call', relatedName: 'Falcon Facilities', createdAt: '2026-08-29T12:00:00.000Z' }));
    await store.save(activity({ id: 'a2', subject: 'Other account note', createdAt: '2026-08-29T11:00:00.000Z' }));
    await store.save(activity({ id: 'b1', tenantId: 'tenant-b', subject: 'Falcon from another tenant', createdAt: '2026-08-29T10:00:00.000Z' }));

    const page = await store.listPaged({ tenantId: 'tenant-a', search: 'falcon' }, { limit: 10, offset: 0 });
    expect(page.items.map((row) => row.id)).toEqual(['a1']);
    expect(page.total).toBe(1);
    expect(page.hasMore).toBe(false);
  });

  it('returns page-independent status summaries', async () => {
    const store = new InMemoryActivityStore();
    await store.save(activity({ id: 'open', status: 'open', dueDate: '2026-08-28', createdAt: '2026-08-01T00:00:00.000Z' }));
    await store.save(activity({ id: 'today', status: 'in_progress', dueDate: '2026-08-29', assigneeId: 'u1', createdAt: '2026-08-01T00:00:00.000Z' }));
    await store.save(activity({ id: 'done', status: 'completed', completedAt: '2026-08-20T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z' }));

    await expect(store.summary({ tenantId: 'tenant-a' }, new Date('2026-08-29T12:00:00.000Z'))).resolves.toEqual({
      total: 3, open: 2, overdue: 1, dueToday: 1, dueThisWeek: 0, completed30: 1, unassigned: 1,
    });
  });
});
