import { type Id, type Page, type PageParams, makePage } from '@aura/shared';
import type { CustomerRefund } from './domain/customer-refund';
import type { CustomerRefundFilter, CustomerRefundStore } from './customer-refund-store';

export class InMemoryCustomerRefundStore implements CustomerRefundStore {
  private readonly data = new Map<string, CustomerRefund>();

  async save(refund: CustomerRefund): Promise<void> {
    this.data.set(refund.id, { ...refund });
  }

  async get(id: Id): Promise<CustomerRefund | null> {
    const r = this.data.get(id);
    return r ? { ...r } : null;
  }

  async list(filter: CustomerRefundFilter = {}): Promise<CustomerRefund[]> {
    let out = [...this.data.values()];
    if (filter.tenantId) out = out.filter((r) => r.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((r) => r.status === filter.status);
    out.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: CustomerRefundFilter, page: PageParams): Promise<Page<CustomerRefund>> {
    const all = await this.list({ ...filter, limit: undefined });
    return makePage(all.slice(page.offset, page.offset + page.limit), all.length, page);
  }

  async existsByNumber(tenantId: Id, refundNumber: string): Promise<boolean> {
    return [...this.data.values()].some((r) => r.tenantId === tenantId && r.refundNumber === refundNumber);
  }
}
