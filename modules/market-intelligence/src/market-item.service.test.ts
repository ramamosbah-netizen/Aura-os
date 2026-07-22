import { describe, it, expect, beforeEach } from 'vitest';
import { MarketItemService } from './market-item.service';
import { InMemoryMarketItemStore } from './in-memory-market-item-store';

function svc() {
  return new MarketItemService(new InMemoryMarketItemStore());
}

describe('MarketItemService', () => {
  let s: MarketItemService;
  beforeEach(() => { s = svc(); });

  it('seeds the starter catalogue, and re-seeding is a no-op (not a reset)', async () => {
    const first = await s.seed('t1');
    expect(first).toBeGreaterThan(10);
    const again = await s.seed('t1');
    expect(again).toBe(0);
    expect((await s.list({ tenantId: 't1' })).length).toBe(first);
  });

  it('searches by name and by brand', async () => {
    await s.seed('t1');
    expect((await s.list({ tenantId: 't1', q: 'camera' })).length).toBeGreaterThanOrEqual(2);
    const byBrand = await s.list({ tenantId: 't1', q: 'honeywell' });
    expect(byBrand.length).toBeGreaterThanOrEqual(1);
    expect(byBrand.every((i) => (i.brand ?? '').toLowerCase().includes('honeywell'))).toBe(true);
  });

  it('filters by category', async () => {
    await s.seed('t1');
    const cctv = await s.list({ tenantId: 't1', category: 'CCTV' });
    expect(cctv.length).toBeGreaterThanOrEqual(3);
    expect(cctv.every((i) => i.category === 'CCTV')).toBe(true);
  });

  it('returns the catalogue in name order', async () => {
    await s.seed('t1');
    const names = (await s.list({ tenantId: 't1', limit: 100 })).map((i) => i.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('never leaks another tenant\'s catalogue', async () => {
    await s.seed('t1');
    expect((await s.list({ tenantId: 't2' })).length).toBe(0);
  });

  it('creates and removes a single item', async () => {
    const item = await s.create({ tenantId: 't1', name: 'Custom sensor', benchmarkCost: 100, benchmarkSell: 180 });
    expect(item.benchmarkCost).toBe(100);
    expect(await s.remove(item.id)).toBe(true);
    expect(await s.get(item.id)).toBeNull();
  });
});
