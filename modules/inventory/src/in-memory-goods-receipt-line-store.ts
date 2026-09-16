import type { GoodsReceiptLineStore } from './goods-receipt-line-store';
import type { GoodsReceiptLine } from './domain/goods-receipt-line';

export class InMemoryGoodsReceiptLineStore implements GoodsReceiptLineStore {
  private readonly lines = new Map<string, GoodsReceiptLine>();

  async save(line: GoodsReceiptLine): Promise<void> {
    this.lines.set(line.id, { ...line });
  }

  async listForReceipt(grnId: string, tenantId: string): Promise<GoodsReceiptLine[]> {
    return [...this.lines.values()]
      .filter((l) => l.grnId === grnId && l.tenantId === tenantId)
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((l) => ({ ...l }));
  }

  async listForOrderLines(poLineIds: string[], tenantId: string): Promise<GoodsReceiptLine[]> {
    const wanted = new Set(poLineIds.filter(Boolean));
    if (wanted.size === 0) return [];
    return [...this.lines.values()]
      .filter((l) => l.tenantId === tenantId && wanted.has(l.poLineId))
      .map((l) => ({ ...l }));
  }
}
