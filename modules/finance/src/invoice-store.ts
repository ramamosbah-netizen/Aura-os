import type { Id } from '@aura/shared';
import type { Invoice } from './domain/invoice';

/** DI token for the invoice store. */
export const INVOICE_STORE = Symbol('INVOICE_STORE');

export interface InvoiceFilter {
  tenantId?: string;
  status?: string;
  poId?: string;
  projectId?: string;
  limit?: number;
}

export interface InvoiceStore {
  create(invoice: Invoice): Promise<void>;
  get(id: Id): Promise<Invoice | null>;
  list(filter?: InvoiceFilter): Promise<Invoice[]>;
}
