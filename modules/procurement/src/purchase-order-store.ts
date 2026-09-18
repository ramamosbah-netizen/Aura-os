import type { TxHandle } from '@aura/core';
import type { Id, Page, PageParams } from '@aura/shared';
import type { PurchaseOrder } from './domain/purchase-order';

/** DI token for the purchase-order store. */
export const PURCHASE_ORDER_STORE = Symbol('PURCHASE_ORDER_STORE');

export interface PurchaseOrderFilter {
  tenantId?: string;
  status?: string;
  projectId?: string;
  discipline?: string;
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
  /**
   * The same read, INSIDE the caller's transaction and HOLDING the row against concurrent writes.
   *
   * Cancelling and closing both decide on what has already happened against an order — how much has
   * been received, how much invoiced — and then write. Between those two moments a delivery can
   * land, and the decision would be made on a position that had already stopped being true: a
   * cancellation reversing a whole commitment while goods were arriving against it.
   *
   * A receipt reconciles onto the order's own row, so `FOR UPDATE` here is what a concurrent receipt
   * blocks on. Either it lands first and the position read sees it, or it waits and reconciles onto
   * an order whose fate is already decided.
   */
  getForUpdate(id: Id, tx: TxHandle | null): Promise<PurchaseOrder | null>;
  list(filter?: PurchaseOrderFilter): Promise<PurchaseOrder[]>;
  listPaged(filter: PurchaseOrderFilter, page: PageParams): Promise<Page<PurchaseOrder>>;
}
