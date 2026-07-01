import type { Id, Page, PageParams } from '@aura/shared';
import type { CustomerInvoice, CustomerInvoiceStatus } from './domain/customer-invoice';

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
}
