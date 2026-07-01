import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { TechnicalQuery } from './domain/technical-query';
import type { TqFilter, TechnicalQueryStore } from './technical-query-store';

export class InMemoryTechnicalQueryStore implements TechnicalQueryStore {
  private readonly items = new Map<string, TechnicalQuery>();

  async create(tq: TechnicalQuery): Promise<void> {
    this.items.set(tq.id, { ...tq });
  }

  async createWithClient(_tx: TxHandle | null, tq: TechnicalQuery): Promise<void> {
    await this.create(tq);
  }

  async update(tq: TechnicalQuery): Promise<void> {
    this.items.set(tq.id, { ...tq });
  }

  async updateWithClient(_tx: TxHandle | null, tq: TechnicalQuery): Promise<void> {
    await this.update(tq);
  }

  async get(id: Id): Promise<TechnicalQuery | null> {
    const found = this.items.get(id);
    return found ? { ...found } : null;
  }

  async list(filter: TqFilter = {}): Promise<TechnicalQuery[]> {
    let list = [...this.items.values()];
    if (filter.tenantId) list = list.filter((i) => i.tenantId === filter.tenantId);
    if (filter.projectId) list = list.filter((i) => i.projectId === filter.projectId);
    if (filter.status) list = list.filter((i) => i.status === filter.status);
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? list.slice(0, filter.limit) : list;
  }

  async listPaged(filter: TqFilter, page: PageParams): Promise<Page<TechnicalQuery>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
