import type { Id, Page, PageParams } from '@aura/shared';
import type { CustomerInvoice, CustomerInvoiceStatus } from './domain/customer-invoice';
import type { CustomerReceipt } from './domain/customer-receipt';

export const CUSTOMER_INVOICE_STORE = Symbol('CUSTOMER_INVOICE_STORE');

export interface CustomerInvoiceFilter {
  tenantId?: string;
  status?: CustomerInvoiceStatus;
  projectId?: string;
  limit?: number;
}

export interface CustomerInvoiceStore {
  save(invoice: CustomerInvoice): Promise<void>;
  get(id: Id): Promise<CustomerInvoice | null>;
  list(filter?: CustomerInvoiceFilter): Promise<CustomerInvoice[]>;
  /** Paged list with total — pushes LIMIT/OFFSET to the source (the pagination contract). */
  listPaged(filter: CustomerInvoiceFilter, page: PageParams): Promise<Page<CustomerInvoice>>;
  /** Soft-delete / restore (sets or clears deleted_at). */
  setDeleted(tenantId: string, id: Id, deleted: boolean): Promise<void>;
  /** True when a LIVE (non-deleted) invoice already carries this number for the tenant. Backs the
   *  per-tenant invoice-number uniqueness guard — an exact lookup, not a limit-bounded list scan. */
  existsByNumber(tenantId: Id, invoiceNumber: string): Promise<boolean>;
  /**
   * RECORD A RECEIPT, and return the invoice as it now stands (AR-INV-02). The store — not the caller —
   * derives the invoice's `amountPaid` and status from its receipts, and refuses a receipt on an
   * invoice that is not open for one or that would take it past its total. `save` never writes
   * `amountPaid`: a receipt is the only way money reaches an invoice.
   */
  addReceipt(receipt: CustomerReceipt): Promise<CustomerInvoice>;
  /** An invoice's receipts, oldest first. */
  listReceipts(tenantId: Id, invoiceId: Id): Promise<CustomerReceipt[]>;
}
