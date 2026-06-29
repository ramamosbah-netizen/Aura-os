import type { Id } from '@aura/shared';
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
    let out = [...this.data.values()];
    if (filter.tenantId) out = out.filter((i) => i.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((i) => i.status === filter.status);
    if (filter.projectId) out = out.filter((i) => i.projectId === filter.projectId);
    out.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
}
