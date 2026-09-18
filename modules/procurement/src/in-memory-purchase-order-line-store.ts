import type { PurchaseOrderLineStore } from './purchase-order-line-store';
import type { PurchaseOrderLine } from './domain/purchase-order-line';

export class InMemoryPurchaseOrderLineStore implements PurchaseOrderLineStore {
  private readonly lines = new Map<string, PurchaseOrderLine>();

  /** No transaction to join in memory: the fallback IS the write (see the port's doc). */
  async saveWithClient(_tx: unknown, line: PurchaseOrderLine): Promise<void> {
    await this.save(line);
  }

  async save(line: PurchaseOrderLine): Promise<void> {
    this.lines.set(line.id, { ...line });
  }

  async find(id: string, tenantId: string): Promise<PurchaseOrderLine | null> {
    const l = this.lines.get(id);
    return l && l.tenantId === tenantId ? { ...l } : null;
  }

  async listForOrder(poId: string, tenantId: string): Promise<PurchaseOrderLine[]> {
    return [...this.lines.values()]
      .filter((l) => l.poId === poId && l.tenantId === tenantId)
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((l) => ({ ...l }));
  }

  async listForRequestLines(prLineIds: string[], tenantId: string): Promise<PurchaseOrderLine[]> {
    const wanted = new Set(prLineIds.filter(Boolean));
    if (wanted.size === 0) return [];
    return [...this.lines.values()]
      .filter((l) => l.tenantId === tenantId && l.sourcePrLineId && wanted.has(l.sourcePrLineId))
      .map((l) => ({ ...l }));
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const l = this.lines.get(id);
    if (l && l.tenantId === tenantId) this.lines.delete(id);
  }
}
