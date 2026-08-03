import type { CostTransaction } from './domain/cost-transaction';
import type { CostLedgerFilter, CostLedgerStore } from './cost-ledger-store';

export class InMemoryCostLedgerStore implements CostLedgerStore {
  private readonly rows: CostTransaction[] = [];

  async append(txn: CostTransaction): Promise<void> {
    this.rows.push({ ...txn });
  }

  async list(filter: CostLedgerFilter): Promise<CostTransaction[]> {
    return this.rows
      .filter((t) => t.tenantId === filter.tenantId)
      .filter((t) => !filter.projectId || t.projectId === filter.projectId)
      .filter((t) => !filter.cbsNodeId || t.cbsNodeId === filter.cbsNodeId)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
      .slice(0, filter.limit ?? 500)
      .map((t) => ({ ...t }));
  }
}
