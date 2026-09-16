import type { Id, Page, PageParams } from '@aura/shared';
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
  getItemByBarcode(tenantId: Id, barcode: string): Promise<StockItem | null>;
  listItems(filter?: StockFilter): Promise<StockItem[]>;
  listItemsPaged(filter: StockFilter, page: PageParams): Promise<Page<StockItem>>;
  addMovement(movement: StockMovement): Promise<void>;
  listMovements(stockItemId: Id): Promise<StockMovement[]>;
  /**
   * Movements coded to one project, across every stock item (`BUY-07`).
   *
   * The delivery question is asked per PROJECT and per WORK PACKAGE, not per stock item — "what
   * reached this package" spans whatever materials went there. Reading by item and stitching would
   * make the answer depend on which items the caller happened to know about.
   */
  listMovementsByProject(tenantId: Id, projectId: Id): Promise<StockMovement[]>;
}
