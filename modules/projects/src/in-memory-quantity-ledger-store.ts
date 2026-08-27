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
