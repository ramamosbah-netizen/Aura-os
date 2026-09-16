import type { PurchaseOrderLine } from './domain/purchase-order-line';

export const PO_LINE_STORE = Symbol('PO_LINE_STORE');

export interface PurchaseOrderLineStore {
  save(line: PurchaseOrderLine): Promise<void>;
  find(id: string, tenantId: string): Promise<PurchaseOrderLine | null>;
  /** Every line on one order, in line order. */
  listForOrder(poId: string, tenantId: string): Promise<PurchaseOrderLine[]>;
  /**
   * "Was this demand ever bought?" — the requisition side of the same lineage, answered by
   * looking the references up directly rather than listing orders and searching them.
   */
  listForRequestLines(prLineIds: string[], tenantId: string): Promise<PurchaseOrderLine[]>;
  remove(id: string, tenantId: string): Promise<void>;
}
