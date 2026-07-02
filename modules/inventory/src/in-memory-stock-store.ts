import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { StockItem, StockMovement } from './domain/stock';
import type { StockFilter, StockStore } from './stock-store';

/** Phase-0 stock store — items + movements in memory (no-DB boots). */
export class InMemoryStockStore implements StockStore {
  private readonly items = new Map<string, StockItem>();
  private readonly movements = new Map<string, StockMovement>();

  async createItem(item: StockItem): Promise<void> {
    this.items.set(item.id, { ...item });
  }

  async updateItem(item: StockItem): Promise<void> {
    this.items.set(item.id, { ...item });
  }

  async getItem(id: Id): Promise<StockItem | null> {
    const i = this.items.get(id);
    return i ? { ...i } : null;
  }

  async getItemByCode(tenantId: Id, code: string): Promise<StockItem | null> {
    const found = [...this.items.values()].find((i) => i.tenantId === tenantId && i.code === code);
    return found ? { ...found } : null;
  }

  async getItemByBarcode(tenantId: Id, barcode: string): Promise<StockItem | null> {
    const found = [...this.items.values()].find((i) => i.tenantId === tenantId && i.barcode === barcode);
    return found ? { ...found } : null;
  }

  async listItems(filter: StockFilter = {}): Promise<StockItem[]> {
    let out = [...this.items.values()];
    if (filter.tenantId) out = out.filter((i) => i.tenantId === filter.tenantId);
    if (filter.warehouse) out = out.filter((i) => i.warehouse === filter.warehouse);
    out.sort((a, b) => (a.code < b.code ? -1 : 1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listItemsPaged(filter: StockFilter, page: PageParams): Promise<Page<StockItem>> {
    const all = await this.listItems({ ...filter, limit: undefined });
    return paginate(all, page);
  }

  async addMovement(movement: StockMovement): Promise<void> {
    this.movements.set(movement.id, { ...movement });
  }

  async listMovements(stockItemId: Id): Promise<StockMovement[]> {
    return [...this.movements.values()]
      .filter((m) => m.stockItemId === stockItemId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}
