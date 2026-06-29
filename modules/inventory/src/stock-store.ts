import type { Id } from '@aura/shared';
import type { StockItem, StockMovement } from './domain/stock';

/** DI token for the stock store. */
export const STOCK_STORE = Symbol('STOCK_STORE');

export interface StockFilter {
  tenantId?: string;
  warehouse?: string;
  limit?: number;
}

export interface StockStore {
  createItem(item: StockItem): Promise<void>;
  updateItem(item: StockItem): Promise<void>;
  getItem(id: Id): Promise<StockItem | null>;
  getItemByCode(tenantId: Id, code: string): Promise<StockItem | null>;
  listItems(filter?: StockFilter): Promise<StockItem[]>;
  addMovement(movement: StockMovement): Promise<void>;
  listMovements(stockItemId: Id): Promise<StockMovement[]>;
}
