import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { DesignChange } from './domain/design-change';
import type { DesignChangeFilter, DesignChangeStore } from './design-change-store';

export class InMemoryDesignChangeStore implements DesignChangeStore {
  private readonly items = new Map<string, DesignChange>();

  async create(dc: DesignChange): Promise<void> {
    this.items.set(dc.id, { ...dc });
  }

  async createWithClient(_tx: TxHandle | null, dc: DesignChange): Promise<void> {
    await this.create(dc);
  }

  async update(dc: DesignChange): Promise<void> {
    this.items.set(dc.id, { ...dc });
  }

  async updateWithClient(_tx: TxHandle | null, dc: DesignChange): Promise<void> {
    await this.update(dc);
  }

  async get(id: Id): Promise<DesignChange | null> {
    const found = this.items.get(id);
    return found ? { ...found } : null;
  }

  async list(filter: DesignChangeFilter = {}): Promise<DesignChange[]> {
    let list = [...this.items.values()];
    if (filter.tenantId) list = list.filter((i) => i.tenantId === filter.tenantId);
    if (filter.projectId) list = list.filter((i) => i.projectId === filter.projectId);
    if (filter.status) list = list.filter((i) => i.status === filter.status);
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? list.slice(0, filter.limit) : list;
  }

  async listPaged(filter: DesignChangeFilter, page: PageParams): Promise<Page<DesignChange>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
