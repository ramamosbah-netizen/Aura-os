import type { Id, Page, PageParams } from '@aura/shared';
import { paginate } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Account } from './domain/account';
import type { AccountFilter, AccountStore } from './account-store';

/** Phase-0 account store — keeps accounts in memory (no-DB boots). */
export class InMemoryAccountStore implements AccountStore {
  private readonly accounts = new Map<string, Account>();

  async create(account: Account): Promise<void> {
    this.accounts.set(account.id, { ...account });
  }

  async createWithClient(_tx: TxHandle | null, account: Account): Promise<void> {
    return this.create(account);
  }

  async update(account: Account): Promise<void> {
    this.accounts.set(account.id, { ...account });
  }

  async updateWithClient(_tx: TxHandle | null, account: Account): Promise<void> {
    return this.update(account);
  }

  async get(id: Id): Promise<Account | null> {
    const a = this.accounts.get(id);
    return a ? { ...a } : null;
  }

  async list(filter: AccountFilter = {}): Promise<Account[]> {
    let out = [...this.accounts.values()];
    if (filter.tenantId) out = out.filter((a) => a.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((a) => a.status === filter.status);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  async listPaged(filter: AccountFilter, page: PageParams): Promise<Page<Account>> {
    const all = await this.list({ ...filter, limit: undefined });
    return paginate(all, page);
  }
}
