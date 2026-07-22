import type { Id } from '@aura/shared';
import type { MarketItem } from './domain/market-item';
import type { MarketItemFilter, MarketItemStore } from './market-item-store';

/** Phase-0 catalogue store. Mirrors the Postgres search + ordering so the two read alike. */
export class InMemoryMarketItemStore implements MarketItemStore {
  private readonly rows = new Map<string, MarketItem>();

  async save(item: MarketItem): Promise<void> {
    this.rows.set(item.id, { ...item });
  }

  async list(filter: MarketItemFilter): Promise<MarketItem[]> {
    const q = filter.q?.trim().toLowerCase();
    return [...this.rows.values()]
      .filter((r) => r.tenantId === filter.tenantId)
      .filter((r) => !filter.category || r.category === filter.category)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.brand ?? '').toLowerCase().includes(q))
      // Name order — a catalogue is browsed, not sorted by recency.
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, filter.limit ?? 50)
      .map((r) => ({ ...r }));
  }

  async get(id: Id): Promise<MarketItem | null> {
    const r = this.rows.get(id);
    return r ? { ...r } : null;
  }

  async remove(id: Id): Promise<boolean> {
    return this.rows.delete(id);
  }

  async count(tenantId: Id): Promise<number> {
    return [...this.rows.values()].filter((r) => r.tenantId === tenantId).length;
  }
}
