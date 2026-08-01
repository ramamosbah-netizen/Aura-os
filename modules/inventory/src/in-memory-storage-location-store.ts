import type { StorageLocationStore } from './storage-location-store';
import type { StorageLocation } from './domain/storage-location';

export class InMemoryStorageLocationStore implements StorageLocationStore {
  private readonly locs = new Map<string, StorageLocation>();

  async save(loc: StorageLocation): Promise<void> {
    this.locs.set(loc.id, { ...loc });
  }

  async find(id: string, tenantId: string): Promise<StorageLocation | null> {
    const l = this.locs.get(id);
    return l && l.tenantId === tenantId ? { ...l } : null;
  }

  async list(tenantId: string, filter?: { warehouse?: string; active?: boolean }): Promise<StorageLocation[]> {
    return [...this.locs.values()]
      .filter((l) => l.tenantId === tenantId
        && (!filter?.warehouse || l.warehouse === filter.warehouse)
        && (filter?.active === undefined || l.active === filter.active))
      .sort((a, b) => (a.warehouse === b.warehouse ? (a.binCode < b.binCode ? -1 : 1) : a.warehouse < b.warehouse ? -1 : 1));
  }
}
