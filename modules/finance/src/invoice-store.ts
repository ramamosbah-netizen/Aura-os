import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
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
  /** Insert on a caller-owned transaction (atomic with its event); null tx falls back to create. */
  createWithClient(tx: TxHandle | null, invoice: Invoice): Promise<void>;
  update(invoice: Invoice): Promise<void>;
  /** Update on a caller-owned transaction (atomic with its event); null tx falls back to update. */
  updateWithClient(tx: TxHandle | null, invoice: Invoice): Promise<void>;
  get(id: Id): Promise<Invoice | null>;
  list(filter?: InvoiceFilter): Promise<Invoice[]>;
}
