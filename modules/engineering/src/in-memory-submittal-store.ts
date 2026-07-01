import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Submittal } from './domain/submittal';
import type { SubmittalFilter, SubmittalStore } from './submittal-store';

export class InMemorySubmittalStore implements SubmittalStore {
  private readonly items = new Map<string, Submittal>();

  async create(submittal: Submittal): Promise<void> {
    this.items.set(submittal.id, { ...submittal });
  }

  async createWithClient(tx: TxHandle | null, submittal: Submittal): Promise<void> {
    await this.create(submittal);
  }

  async update(submittal: Submittal): Promise<void> {
    this.items.set(submittal.id, { ...submittal });
  }

  async updateWithClient(tx: TxHandle | null, submittal: Submittal): Promise<void> {
    await this.update(submittal);
  }

  async get(id: Id): Promise<Submittal | null> {
    const found = this.items.get(id);
    return found ? { ...found } : null;
  }

  async getByCode(tenantId: Id, projectId: Id, code: string): Promise<Submittal | null> {
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.projectId === projectId && item.code === code) {
        return { ...item };
      }
    }
    return null;
  }

  async list(filter: SubmittalFilter = {}): Promise<Submittal[]> {
    let list = [...this.items.values()];
    if (filter.tenantId) list = list.filter((i) => i.tenantId === filter.tenantId);
    if (filter.projectId) list = list.filter((i) => i.projectId === filter.projectId);
    if (filter.status) list = list.filter((i) => i.status === filter.status);
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? list.slice(0, filter.limit) : list;
  }

  async listPaged(filter: SubmittalFilter, page: PageParams): Promise<Page<Submittal>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
