import type { GoodsReceiptLine } from './domain/goods-receipt-line';

export const GRN_LINE_STORE = Symbol('GRN_LINE_STORE');

export interface GoodsReceiptLineStore {
  save(line: GoodsReceiptLine): Promise<void>;
  listForReceipt(grnId: string, tenantId: string): Promise<GoodsReceiptLine[]>;
  /**
   * Every receipt line against these order lines, looked up DIRECTLY.
   *
   * Not "list the receipts and search them": that is the defect TC-GATE-18 pinned in this module's
   * other resolver, where a default limit made a real record read as absent.
   */
  listForOrderLines(poLineIds: string[], tenantId: string): Promise<GoodsReceiptLine[]>;
}
