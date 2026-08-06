import type { Id, Page, PageParams } from '@aura/shared';
import type { CustomerRefund, CustomerRefundStatus } from './domain/customer-refund';

export const CUSTOMER_REFUND_STORE = Symbol('CUSTOMER_REFUND_STORE');

export interface CustomerRefundFilter {
  tenantId?: string;
  status?: CustomerRefundStatus;
  limit?: number;
}

export interface CustomerRefundStore {
  save(refund: CustomerRefund): Promise<void>;
  get(id: Id): Promise<CustomerRefund | null>;
  list(filter?: CustomerRefundFilter): Promise<CustomerRefund[]>;
  listPaged(filter: CustomerRefundFilter, page: PageParams): Promise<Page<CustomerRefund>>;
  existsByNumber(tenantId: Id, refundNumber: string): Promise<boolean>;
}
