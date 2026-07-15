import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { Quotation } from './domain/quotation';
import type { QuotationFilter, QuotationStore } from './quotation-store';

export class InMemoryQuotationStore implements QuotationStore {
  private readonly data = new Map<string, Quotation>();

  async save(q: Quotation): Promise<void> {
    this.data.set(q.id, { ...q, lines: q.lines.map((l) => ({ ...l })) });
  }

  async get(id: Id): Promise<Quotation | null> {
    const q = this.data.get(id);
    return q ? { ...q, lines: q.lines.map((l) => ({ ...l })) } : null;
  }

  async list(filter: QuotationFilter = {}): Promise<Quotation[]> {
    let out = [...this.data.values()];
    if (filter.tenantId) out = out.filter((q) => q.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((q) => q.status === filter.status);
    if (filter.accountId) out = out.filter((q) => q.accountId === filter.accountId);
    if (filter.sourceTenderId) out = out.filter((q) => q.sourceTenderId === filter.sourceTenderId);
    if (filter.sourceOpportunityId) out = out.filter((q) => q.sourceOpportunityId === filter.sourceOpportunityId);
    if (filter.quoteNumber) out = out.filter((q) => q.quoteNumber === filter.quoteNumber);
    out.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: QuotationFilter, page: PageParams): Promise<Page<Quotation>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
