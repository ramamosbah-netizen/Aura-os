import type { Id, Page, PageParams } from '@aura/shared';
import type { PurchaseRequest } from './domain/purchase-request';

export const PURCHASE_REQUEST_STORE = Symbol('PURCHASE_REQUEST_STORE');

export interface PurchaseRequestFilter {
  tenantId?: string;
  status?: string;
  projectId?: string;
  discipline?: string;
  limit?: number;
}

export interface PurchaseRequestStore {
  create(pr: PurchaseRequest): Promise<void>;
  update(pr: PurchaseRequest): Promise<void>;
  get(id: Id): Promise<PurchaseRequest | null>;
  list(filter?: PurchaseRequestFilter): Promise<PurchaseRequest[]>;
  listPaged(filter: PurchaseRequestFilter, page: PageParams): Promise<Page<PurchaseRequest>>;
}
