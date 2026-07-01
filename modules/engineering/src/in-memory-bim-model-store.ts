import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { BimModel } from './domain/bim-model';
import type { BimModelFilter, BimModelStore } from './bim-model-store';

export class InMemoryBimModelStore implements BimModelStore {
  private readonly items = new Map<string, BimModel>();

  async save(model: BimModel): Promise<void> {
    this.items.set(model.id, { ...model });
  }

  async get(id: Id): Promise<BimModel | null> {
    const m = this.items.get(id);
    return m ? { ...m } : null;
  }

  async list(filter: BimModelFilter = {}): Promise<BimModel[]> {
    let out = [...this.items.values()];
    if (filter.tenantId) out = out.filter((m) => m.tenantId === filter.tenantId);
    if (filter.projectId) out = out.filter((m) => m.projectId === filter.projectId);
    if (filter.discipline) out = out.filter((m) => m.discipline === filter.discipline);
    if (filter.status) out = out.filter((m) => m.status === filter.status);
    out.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: BimModelFilter, page: PageParams): Promise<Page<BimModel>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
