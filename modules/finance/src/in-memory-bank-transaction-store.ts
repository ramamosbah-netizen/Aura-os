import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { BankTransaction } from './domain/bank-transaction';
import type { BankTransactionFilter, BankTransactionStore } from './bank-transaction-store';

export class InMemoryBankTransactionStore implements BankTransactionStore {
  private readonly transactions = new Map<string, BankTransaction>();

  async create(tx: BankTransaction): Promise<void> {
    this.transactions.set(tx.id, { ...tx });
  }

  async update(tx: BankTransaction): Promise<void> {
    this.transactions.set(tx.id, { ...tx });
  }

  async get(id: Id): Promise<BankTransaction | null> {
    const tx = this.transactions.get(id);
    return tx ? { ...tx } : null;
  }

  async list(filter?: BankTransactionFilter): Promise<BankTransaction[]> {
    let out = [...this.transactions.values()];
    if (filter?.tenantId) {
      out = out.filter((tx) => tx.tenantId === filter.tenantId);
    }
    if (filter?.bankAccountId) {
      out = out.filter((tx) => tx.bankAccountId === filter.bankAccountId);
    }
    if (filter?.status) {
      out = out.filter((tx) => tx.status === filter.status);
    }
    if (filter?.limit) {
      out = out.slice(0, filter.limit);
    }
    return out;
  }

  async listPaged(filter: BankTransactionFilter, page: PageParams): Promise<Page<BankTransaction>> {
    const all = await this.list({ ...filter, limit: undefined });
    all.sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : -1));
    return paginate(all, page);
  }
}
