import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Invoice } from './domain/invoice';
import type { InvoiceFilter, InvoiceStore } from './invoice-store';

/** Phase-0 invoice store — keeps invoices in memory (no-DB boots). */
export class InMemoryInvoiceStore implements InvoiceStore {
  private readonly invoices = new Map<string, Invoice>();

  async create(invoice: Invoice): Promise<void> {
    this.invoices.set(invoice.id, { ...invoice });
  }

  async createWithClient(_tx: TxHandle | null, invoice: Invoice): Promise<void> {
    return this.create(invoice);
  }

  async update(invoice: Invoice): Promise<void> {
    this.invoices.set(invoice.id, { ...invoice });
  }

  async get(id: Id): Promise<Invoice | null> {
    const inv = this.invoices.get(id);
    return inv ? { ...inv } : null;
  }

  async list(filter: InvoiceFilter = {}): Promise<Invoice[]> {
    let out = [...this.invoices.values()];
    if (filter.tenantId) out = out.filter((i) => i.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((i) => i.status === filter.status);
    if (filter.poId) out = out.filter((i) => i.poId === filter.poId);
    if (filter.projectId) out = out.filter((i) => i.projectId === filter.projectId);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
}
