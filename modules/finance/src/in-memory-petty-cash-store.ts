import type { Id } from '@aura/shared';
import type { PettyCashFund, PettyCashTransaction } from './domain/petty-cash';
import type { PettyCashFilter, PettyCashStore } from './petty-cash-store';

export class InMemoryPettyCashStore implements PettyCashStore {
  private readonly funds = new Map<string, PettyCashFund>();
  private readonly txns = new Map<string, PettyCashTransaction>();

  async createFund(fund: PettyCashFund): Promise<void> {
    this.funds.set(fund.id, { ...fund });
  }

  async updateFund(fund: PettyCashFund): Promise<void> {
    this.funds.set(fund.id, { ...fund });
  }

  async getFund(id: Id): Promise<PettyCashFund | null> {
    const f = this.funds.get(id);
    return f ? { ...f } : null;
  }

  async listFunds(filter: PettyCashFilter = {}): Promise<PettyCashFund[]> {
    let out = [...this.funds.values()];
    if (filter.tenantId) out = out.filter((f) => f.tenantId === filter.tenantId);
    out.sort((a, b) => (a.name < b.name ? -1 : 1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async addTransaction(tx: PettyCashTransaction): Promise<void> {
    this.txns.set(tx.id, { ...tx });
  }

  async listTransactions(fundId: Id): Promise<PettyCashTransaction[]> {
    return [...this.txns.values()]
      .filter((t) => t.fundId === fundId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}
