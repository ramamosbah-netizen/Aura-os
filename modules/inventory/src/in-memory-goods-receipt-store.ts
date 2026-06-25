import type { Id } from '@aura/shared';
import type { GoodsReceipt } from './domain/goods-receipt';
import type { GoodsReceiptFilter, GoodsReceiptStore } from './goods-receipt-store';

/** Phase-0 GRN store — keeps goods receipts in memory (no-DB boots). */
export class InMemoryGoodsReceiptStore implements GoodsReceiptStore {
  private readonly grns = new Map<string, GoodsReceipt>();

  async create(grn: GoodsReceipt): Promise<void> {
    this.grns.set(grn.id, { ...grn });
  }

  async get(id: Id): Promise<GoodsReceipt | null> {
    const g = this.grns.get(id);
    return g ? { ...g } : null;
  }

  async list(filter: GoodsReceiptFilter = {}): Promise<GoodsReceipt[]> {
    let out = [...this.grns.values()];
    if (filter.tenantId) out = out.filter((g) => g.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((g) => g.status === filter.status);
    if (filter.poId) out = out.filter((g) => g.poId === filter.poId);
    if (filter.projectId) out = out.filter((g) => g.projectId === filter.projectId);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
}
