import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { VariationOrder } from './domain/variation';
import type { VariationFilter, VariationStore } from './variation-store';

/** Phase-0 variation store — keeps variation orders in memory (no-DB boots). */
export class InMemoryVariationStore implements VariationStore {
  private readonly rows = new Map<string, VariationOrder>();

  async create(v: VariationOrder): Promise<void> {
    this.rows.set(v.id, { ...v });
  }

  async update(v: VariationOrder): Promise<void> {
    this.rows.set(v.id, { ...v });
  }

  async get(id: Id): Promise<VariationOrder | null> {
    const v = this.rows.get(id);
    return v ? { ...v } : null;
  }

  async list(filter: VariationFilter = {}): Promise<VariationOrder[]> {
    let out = [...this.rows.values()];
    if (filter.tenantId) out = out.filter((v) => v.tenantId === filter.tenantId);
    if (filter.projectId) out = out.filter((v) => v.projectId === filter.projectId);
    if (filter.status) out = out.filter((v) => v.status === filter.status);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: VariationFilter, page: PageParams): Promise<Page<VariationOrder>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
