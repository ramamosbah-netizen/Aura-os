import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Rfi } from './domain/rfi';
import type { RfiFilter, RfiStore } from './rfi-store';

export class InMemoryRfiStore implements RfiStore {
  private readonly items = new Map<string, Rfi>();

  async create(rfi: Rfi): Promise<void> {
    this.items.set(rfi.id, { ...rfi });
  }

  async createWithClient(tx: TxHandle | null, rfi: Rfi): Promise<void> {
    await this.create(rfi);
  }

  async update(rfi: Rfi): Promise<void> {
    this.items.set(rfi.id, { ...rfi });
  }

  async updateWithClient(tx: TxHandle | null, rfi: Rfi): Promise<void> {
    await this.update(rfi);
  }

  async get(id: Id): Promise<Rfi | null> {
    const found = this.items.get(id);
    return found ? { ...found } : null;
  }

  async getByCode(tenantId: Id, projectId: Id, code: string): Promise<Rfi | null> {
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.projectId === projectId && item.code === code) {
        return { ...item };
      }
    }
    return null;
  }

  async list(filter: RfiFilter = {}): Promise<Rfi[]> {
    let list = [...this.items.values()];
    if (filter.tenantId) list = list.filter((i) => i.tenantId === filter.tenantId);
    if (filter.projectId) list = list.filter((i) => i.projectId === filter.projectId);
    if (filter.status) list = list.filter((i) => i.status === filter.status);
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? list.slice(0, filter.limit) : list;
  }
}
