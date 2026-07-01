import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { ContractObligation } from './domain/contract-obligation';
import type { ObligationFilter, ObligationStore } from './obligation-store';

export class InMemoryObligationStore implements ObligationStore {
  private readonly items = new Map<string, ContractObligation>();

  async save(o: ContractObligation): Promise<void> {
    this.items.set(o.id, { ...o });
  }

  async get(id: Id): Promise<ContractObligation | null> {
    const o = this.items.get(id);
    return o ? { ...o } : null;
  }

  async list(filter: ObligationFilter = {}): Promise<ContractObligation[]> {
    let out = [...this.items.values()];
    if (filter.tenantId) out = out.filter((o) => o.tenantId === filter.tenantId);
    if (filter.contractId) out = out.filter((o) => o.contractId === filter.contractId);
    if (filter.status) out = out.filter((o) => o.status === filter.status);
    out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: ObligationFilter, page: PageParams): Promise<Page<ContractObligation>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
