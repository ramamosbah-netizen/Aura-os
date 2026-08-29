import { describe, expect, it } from 'vitest';
import { makeSignal } from '@aura/shared';
import { InMemorySignalStore } from './in-memory-signal-store';

describe('Radar query contract', () => {
  it('applies search and filters before bounded pagination and keeps summary page-independent', async () => {
    const store = new InMemorySignalStore();
    for (let i = 0; i < 125; i++) await store.create(makeSignal({ tenantId: 'tenant-a', title: `Expansion ${i}`, source: i % 2 ? 'MARKET' : 'ACCOUNT_GROWTH', type: 'EXPANSION', accountName: `Customer ${i}`, confidence: i % 100, detectedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }));
    await store.create(makeSignal({ tenantId: 'tenant-b', title: 'Expansion 999', source: 'MARKET', type: 'EXPANSION', accountName: 'Other tenant', confidence: 99 }));

    const filter = { tenantId: 'tenant-a', search: 'Customer 124', source: 'ACCOUNT_GROWTH' as const };
    const page = await store.listPaged(filter, { limit: 10, offset: 0 });
    expect(page.total).toBe(1);
    expect(page.items[0]?.accountName).toBe('Customer 124');
    expect(page.hasMore).toBe(false);

    const first = await store.listPaged({ tenantId: 'tenant-a' }, { limit: 50, offset: 0 });
    const last = await store.listPaged({ tenantId: 'tenant-a' }, { limit: 50, offset: 100 });
    expect(first.total).toBe(125);
    expect(last.items).toHaveLength(25);
    const summary = await store.summary({ tenantId: 'tenant-a' });
    expect(summary.total).toBe(125);
    expect(summary.open).toBe(125);
    expect(summary.highPotential).toBe(30);
    expect((await store.exportAll({ tenantId: 'tenant-a' }))).toHaveLength(125);
  });
});
