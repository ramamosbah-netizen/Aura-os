import type { Id, Page, PageParams } from '@aura/shared';
import type { Payment } from './domain/payment';

export const PAYMENT_STORE = Symbol('PAYMENT_STORE');

export interface PaymentFilter {
  tenantId?: string;
  invoiceId?: string;
  limit?: number;
}

export interface PaymentStore {
  create(payment: Payment): Promise<void>;
  get(id: Id): Promise<Payment | null>;
  list(filter?: PaymentFilter): Promise<Payment[]>;
  listPaged(filter: PaymentFilter, page: PageParams): Promise<Page<Payment>>;
}
