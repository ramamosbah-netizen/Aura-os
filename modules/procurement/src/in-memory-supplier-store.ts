import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { Supplier } from './domain/supplier';
import type { SupplierFilter, SupplierStore } from './supplier-store';

export class InMemorySupplierStore implements SupplierStore {
  private readonly data = new Map<string, Supplier>();

  async create(s: Supplier): Promise<void> {
    this.data.set(s.id, { ...s });
  }

  async update(s: Supplier): Promise<void> {
    this.data.set(s.id, { ...s });
  }

  async get(id: Id): Promise<Supplier | null> {
    const s = this.data.get(id);
    return s ? { ...s } : null;
  }

  async getByCode(tenantId: Id, code: string): Promise<Supplier | null> {
    const found = [...this.data.values()].find((s) => s.tenantId === tenantId && s.code === code);
    return found ? { ...found } : null;
  }

  async list(filter: SupplierFilter = {}): Promise<Supplier[]> {
    let out = [...this.data.values()];
    if (filter.tenantId) out = out.filter((s) => s.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((s) => s.status === filter.status);
    if (filter.category) out = out.filter((s) => s.category === filter.category);
    out.sort((a, b) => (a.name < b.name ? -1 : 1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: SupplierFilter, page: PageParams): Promise<Page<Supplier>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
