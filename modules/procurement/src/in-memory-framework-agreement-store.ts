import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { FrameworkAgreement } from './domain/framework-agreement';
import type { FrameworkAgreementFilter, FrameworkAgreementStore } from './framework-agreement-store';

/** Phase-0 framework-agreement store — in memory (no-DB boots). */
export class InMemoryFrameworkAgreementStore implements FrameworkAgreementStore {
  private readonly agreements = new Map<string, FrameworkAgreement>();

  async save(fa: FrameworkAgreement): Promise<void> {
    this.agreements.set(fa.id, { ...fa, items: fa.items.map((i) => ({ ...i })) });
  }

  async get(id: Id): Promise<FrameworkAgreement | null> {
    const fa = this.agreements.get(id);
    return fa ? { ...fa, items: fa.items.map((i) => ({ ...i })) } : null;
  }

  async list(filter: FrameworkAgreementFilter = {}): Promise<FrameworkAgreement[]> {
    let out = [...this.agreements.values()];
    if (filter.tenantId) out = out.filter((fa) => fa.tenantId === filter.tenantId);
    if (filter.supplierId) out = out.filter((fa) => fa.supplierId === filter.supplierId);
    if (filter.status) out = out.filter((fa) => fa.status === filter.status);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    out = out.map((fa) => ({ ...fa, items: fa.items.map((i) => ({ ...i })) }));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: FrameworkAgreementFilter, page: PageParams): Promise<Page<FrameworkAgreement>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
