import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { PurchaseRequest } from './domain/purchase-request';
import type { PurchaseRequestFilter, PurchaseRequestStore } from './purchase-request-store';

export class InMemoryPurchaseRequestStore implements PurchaseRequestStore {
  private readonly requests = new Map<string, PurchaseRequest>();

  async create(pr: PurchaseRequest): Promise<void> {
    this.requests.set(pr.id, { ...pr });
  }

  async update(pr: PurchaseRequest): Promise<void> {
    this.requests.set(pr.id, { ...pr });
  }

  async get(id: Id): Promise<PurchaseRequest | null> {
    const pr = this.requests.get(id);
    return pr ? { ...pr } : null;
  }

  async list(filter: PurchaseRequestFilter = {}): Promise<PurchaseRequest[]> {
    let out = [...this.requests.values()];
    if (filter.tenantId) out = out.filter((r) => r.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((r) => r.status === filter.status);
    if (filter.projectId) out = out.filter((r) => r.projectId === filter.projectId);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: PurchaseRequestFilter, page: PageParams): Promise<Page<PurchaseRequest>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
