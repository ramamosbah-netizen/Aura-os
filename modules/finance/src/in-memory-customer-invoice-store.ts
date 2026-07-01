import { type Id, type Page, type PageParams, makePage } from '@aura/shared';
import type { CustomerInvoice } from './domain/customer-invoice';
import type { CustomerInvoiceFilter, CustomerInvoiceStore } from './customer-invoice-store';

export class InMemoryCustomerInvoiceStore implements CustomerInvoiceStore {
  private readonly data = new Map<string, CustomerInvoice>();

  async save(inv: CustomerInvoice): Promise<void> {
    this.data.set(inv.id, { ...inv, lines: inv.lines.map((l) => ({ ...l })) });
  }

  async get(id: Id): Promise<CustomerInvoice | null> {
    const inv = this.data.get(id);
    return inv ? { ...inv, lines: inv.lines.map((l) => ({ ...l })) } : null;
  }

  async list(filter: CustomerInvoiceFilter = {}): Promise<CustomerInvoice[]> {
    let out = [...this.data.values()].filter((i) => !i.deletedAt);
    if (filter.tenantId) out = out.filter((i) => i.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((i) => i.status === filter.status);
    if (filter.projectId) out = out.filter((i) => i.projectId === filter.projectId);
    out.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: CustomerInvoiceFilter, page: PageParams): Promise<Page<CustomerInvoice>> {
    const all = await this.list({ ...filter, limit: undefined });
    const items = all.slice(page.offset, page.offset + page.limit);
    return makePage(items, all.length, page);
  }

  async setDeleted(tenantId: string, id: Id, deleted: boolean): Promise<void> {
    const inv = this.data.get(id);
    if (inv && inv.tenantId === tenantId) inv.deletedAt = deleted ? new Date().toISOString() : null;
  }
}
