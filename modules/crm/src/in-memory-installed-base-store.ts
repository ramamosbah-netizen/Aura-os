import type { Id } from '@aura/shared';
import type { InstalledBaseItem } from './domain/installed-base';
import type { InstalledBaseStore } from './installed-base-store';

/** Phase-0 installed-base store — in memory (no-DB boots). */
export class InMemoryInstalledBaseStore implements InstalledBaseStore {
  private readonly items = new Map<string, InstalledBaseItem>();

  async create(item: InstalledBaseItem): Promise<void> {
    this.items.set(item.id, { ...item });
  }

  async update(item: InstalledBaseItem): Promise<void> {
    this.items.set(item.id, { ...item });
  }

  async get(id: Id): Promise<InstalledBaseItem | null> {
    const i = this.items.get(id);
    return i ? { ...i } : null;
  }

  async delete(id: Id): Promise<void> {
    this.items.delete(id);
  }

  async listFor(tenantId: Id, accountId: Id): Promise<InstalledBaseItem[]> {
    return [...this.items.values()]
      .filter((i) => i.tenantId === tenantId && i.accountId === accountId)
      .sort((a, b) => (a.system < b.system ? -1 : 1));
  }
}
