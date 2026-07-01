import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { ContractClause } from './domain/contract-clause';
import type { ClauseFilter, ClauseStore } from './clause-store';

export class InMemoryClauseStore implements ClauseStore {
  private readonly items = new Map<string, ContractClause>();

  async save(clause: ContractClause): Promise<void> {
    this.items.set(clause.id, { ...clause });
  }

  async get(id: Id): Promise<ContractClause | null> {
    const c = this.items.get(id);
    return c ? { ...c } : null;
  }

  async list(filter: ClauseFilter = {}): Promise<ContractClause[]> {
    let out = [...this.items.values()];
    if (filter.tenantId) out = out.filter((c) => c.tenantId === filter.tenantId);
    if (filter.category) out = out.filter((c) => c.category === filter.category);
    if (filter.active !== undefined) out = out.filter((c) => c.active === filter.active);
    out.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: ClauseFilter, page: PageParams): Promise<Page<ContractClause>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
