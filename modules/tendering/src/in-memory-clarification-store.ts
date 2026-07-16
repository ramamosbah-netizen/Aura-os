import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TenderClarification } from './domain/clarification';
import type { ClarificationFilter, ClarificationStore } from './clarification-store';

/** Phase-0 clarification store — keeps records in memory (no-DB boots). */
export class InMemoryClarificationStore implements ClarificationStore {
  private readonly records = new Map<string, TenderClarification>();

  async save(c: TenderClarification): Promise<void> {
    this.records.set(c.id, { ...c });
  }

  async get(id: Id): Promise<TenderClarification | null> {
    const c = this.records.get(id);
    return c ? { ...c } : null;
  }

  async list(filter: ClarificationFilter = {}): Promise<TenderClarification[]> {
    let out = [...this.records.values()];
    if (filter.tenantId) out = out.filter((c) => c.tenantId === filter.tenantId);
    if (filter.tenderId) out = out.filter((c) => c.tenderId === filter.tenderId);
    if (filter.kind) out = out.filter((c) => c.kind === filter.kind);
    if (filter.open) out = out.filter((c) => c.answeredAt === null);
    out.sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: ClarificationFilter, page: PageParams): Promise<Page<TenderClarification>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
