import type { Id } from '@aura/shared';
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
}
