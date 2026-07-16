import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Tender } from './domain/tender';
import type { TenderFilter, TenderStore } from './tender-store';

/** Phase-0 tender store — keeps tenders in memory (no-DB boots). */
export class InMemoryTenderStore implements TenderStore {
  private readonly tenders = new Map<string, Tender>();

  async create(tender: Tender): Promise<void> {
    this.tenders.set(tender.id, { ...tender });
  }

  async createWithClient(_tx: TxHandle | null, tender: Tender): Promise<void> {
    return this.create(tender);
  }

  async update(tender: Tender): Promise<void> {
    this.tenders.set(tender.id, { ...tender });
  }

  async updateWithClient(_tx: TxHandle | null, tender: Tender): Promise<void> {
    return this.update(tender);
  }

  async get(id: Id): Promise<Tender | null> {
    const t = this.tenders.get(id);
    return t ? { ...t } : null;
  }

  async list(filter: TenderFilter = {}): Promise<Tender[]> {
    let out = [...this.tenders.values()];
    if (filter.tenantId) out = out.filter((t) => t.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((t) => t.status === filter.status);
    if (filter.source) out = out.filter((t) => t.source === filter.source);
    if (filter.accountId) out = out.filter((t) => t.accountId === filter.accountId);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: TenderFilter, page: PageParams): Promise<Page<Tender>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
