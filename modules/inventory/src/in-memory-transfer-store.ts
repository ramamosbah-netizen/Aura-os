import type { Id } from '@aura/shared';
import type { StockTransfer } from './domain/stock-transfer';
import type { TransferFilter, TransferStore } from './transfer-store';

export class InMemoryTransferStore implements TransferStore {
  private readonly data = new Map<string, StockTransfer>();

  async save(t: StockTransfer): Promise<void> {
    this.data.set(t.id, { ...t });
  }

  async get(id: Id): Promise<StockTransfer | null> {
    const t = this.data.get(id);
    return t ? { ...t } : null;
  }

  async list(filter: TransferFilter = {}): Promise<StockTransfer[]> {
    let out = [...this.data.values()];
    if (filter.tenantId) out = out.filter((t) => t.tenantId === filter.tenantId);
    out.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
}
