import type { QuantityTransaction } from './domain/quantity-transaction';
import type { QuantityAppendResult, QuantityLedgerFilter, QuantityLedgerStore } from './quantity-ledger-store';

export class InMemoryQuantityLedgerStore implements QuantityLedgerStore {
  private readonly rows: QuantityTransaction[] = [];

  async append(txn: QuantityTransaction): Promise<QuantityAppendResult> {
    if (txn.dedupeKey) {
      const existing = this.rows.find((r) => r.tenantId === txn.tenantId && r.dedupeKey === txn.dedupeKey);
      if (existing) return { txn: { ...existing }, inserted: false };
    }
    this.rows.push({ ...txn });
    return { txn: { ...txn }, inserted: true };
  }

  async findByDedupeKey(tenantId: string, dedupeKey: string): Promise<QuantityTransaction | null> {
    const found = this.rows.find((t) => t.tenantId === tenantId && t.dedupeKey === dedupeKey);
    return found ? { ...found } : null;
  }

  async listForBoqItem(tenantId: string, boqItemId: string): Promise<QuantityTransaction[]> {
    return this.rows
      .filter((t) => t.tenantId === tenantId && t.boqItemId === boqItemId)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
      .map((t) => ({ ...t }));
  }

  // NOTE (TC-GATE-20): unlike the drawing and RFQ stores, this adapter DOES apply the same
  // default cap as Postgres — so the position defect was reachable from a unit test all along.
  // Nobody wrote one with five hundred rows, which is its own lesson: agreeing adapters are not
  // the same thing as a test that exercises the limit.
  async list(filter: QuantityLedgerFilter): Promise<QuantityTransaction[]> {
    return this.rows
      .filter((t) => t.tenantId === filter.tenantId)
      .filter((t) => !filter.projectId || t.projectId === filter.projectId)
      .filter((t) => !filter.boqItemId || t.boqItemId === filter.boqItemId)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
      .slice(0, filter.limit ?? 500)
      .map((t) => ({ ...t }));
  }
}
