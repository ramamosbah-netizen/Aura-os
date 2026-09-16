import type { PurchaseRequestLineStore } from './purchase-request-line-store';
import type { PurchaseRequestLine } from './domain/purchase-request-line';

export class InMemoryPurchaseRequestLineStore implements PurchaseRequestLineStore {
  private readonly lines = new Map<string, PurchaseRequestLine>();

  async save(line: PurchaseRequestLine): Promise<void> {
    this.lines.set(line.id, { ...line });
  }

  async find(id: string, tenantId: string): Promise<PurchaseRequestLine | null> {
    const l = this.lines.get(id);
    return l && l.tenantId === tenantId ? { ...l } : null;
  }

  async listForRequest(prId: string, tenantId: string): Promise<PurchaseRequestLine[]> {
    return [...this.lines.values()]
      .filter((l) => l.prId === prId && l.tenantId === tenantId)
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((l) => ({ ...l }));
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const l = this.lines.get(id);
    if (l && l.tenantId === tenantId) this.lines.delete(id);
  }
}
