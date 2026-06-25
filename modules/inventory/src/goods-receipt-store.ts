import type { Id } from '@aura/shared';
import type { GoodsReceipt } from './domain/goods-receipt';

/** DI token for the goods-receipt store. */
export const GOODS_RECEIPT_STORE = Symbol('GOODS_RECEIPT_STORE');

export interface GoodsReceiptFilter {
  tenantId?: string;
  status?: string;
  poId?: string;
  projectId?: string;
  limit?: number;
}

export interface GoodsReceiptStore {
  create(grn: GoodsReceipt): Promise<void>;
  get(id: Id): Promise<GoodsReceipt | null>;
  list(filter?: GoodsReceiptFilter): Promise<GoodsReceipt[]>;
}
