import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { PurchaseOrder } from './domain/purchase-order';

/** DI token for the purchase-order store. */
export const PURCHASE_ORDER_STORE = Symbol('PURCHASE_ORDER_STORE');

export interface PurchaseOrderFilter {
  tenantId?: string;
  status?: string;
  projectId?: string;
  limit?: number;
}

export interface PurchaseOrderStore {
  create(po: PurchaseOrder): Promise<void>;
  /** Insert on a caller-owned transaction (atomic with its event); null tx falls back to create. */
  createWithClient(tx: TxHandle | null, po: PurchaseOrder): Promise<void>;
  update(po: PurchaseOrder): Promise<void>;
  /** Update on a caller-owned transaction (atomic with its event); null tx falls back to update. */
  updateWithClient(tx: TxHandle | null, po: PurchaseOrder): Promise<void>;
  get(id: Id): Promise<PurchaseOrder | null>;
  list(filter?: PurchaseOrderFilter): Promise<PurchaseOrder[]>;
}
