import { type Id, type Page, type PageParams, makePage } from '@aura/shared';
import { type CustomerInvoice, receiptStatus, recordReceipt } from './domain/customer-invoice';
import { type CustomerReceipt, amountPaidFrom } from './domain/customer-receipt';
import type { CustomerInvoiceFilter, CustomerInvoiceStore } from './customer-invoice-store';

/**
 * In-memory twin of the PostgreSQL store, INCLUDING what migration 0400 makes the database enforce:
 * `amountPaid` is the sum of the invoice's receipts and nothing else, and an invoice carrying receipts
 * can only be partially paid or paid. A save that says otherwise is refused here as it is there, so a
 * test on this store cannot pass on behaviour the real one refuses.
 */
export class InMemoryCustomerInvoiceStore implements CustomerInvoiceStore {
  private readonly data = new Map<string, CustomerInvoice>();
  private readonly receipts: CustomerReceipt[] = [];

  private paidOf(invoiceId: Id): number {
    return amountPaidFrom(this.receipts.filter((r) => r.invoiceId === invoiceId));
  }

  async save(inv: CustomerInvoice): Promise<void> {
    const prior = this.data.get(inv.id);
    // `amountPaid` is not the caller's to write — the receipts decide it, as the database's do.
    const amountPaid = prior ? this.paidOf(inv.id) : 0;
    if (prior && amountPaid > 0 && inv.status !== prior.status && inv.status !== receiptStatus(inv.total, amountPaid)) {
      throw new Error(`an invoice with receipts recorded can only be ${receiptStatus(inv.total, amountPaid).replace('_', ' ')} — its status follows its receipts`);
    }
    this.data.set(inv.id, { ...inv, amountPaid, lines: inv.lines.map((l) => ({ ...l })) });
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

  async existsByNumber(tenantId: Id, invoiceNumber: string): Promise<boolean> {
    return [...this.data.values()].some(
      (i) => i.tenantId === tenantId && i.invoiceNumber === invoiceNumber && !i.deletedAt,
    );
  }

  async addReceipt(receipt: CustomerReceipt): Promise<CustomerInvoice> {
    const inv = this.data.get(receipt.invoiceId);
    if (!inv || inv.tenantId !== receipt.tenantId) throw new Error(`customer invoice ${receipt.invoiceId} not found`);
    // The same rule the database trigger applies — status open for a receipt, and never past the total.
    const after = recordReceipt({ ...inv, amountPaid: this.paidOf(inv.id) }, receipt.amount);
    this.receipts.push({ ...receipt });
    this.data.set(inv.id, { ...inv, amountPaid: this.paidOf(inv.id), status: after.status });
    return (await this.get(inv.id))!;
  }

  async listReceipts(tenantId: Id, invoiceId: Id): Promise<CustomerReceipt[]> {
    return this.receipts.filter((r) => r.tenantId === tenantId && r.invoiceId === invoiceId).map((r) => ({ ...r }));
  }
}
