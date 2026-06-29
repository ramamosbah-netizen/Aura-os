import type { Id } from '@aura/shared';
import type { Account } from './domain/account';
import type { AccountFilter, AccountStore } from './account-store';

export class InMemoryAccountStore implements AccountStore {
  private readonly accounts = new Map<string, Account>();

  async create(account: Account): Promise<void> {
    this.accounts.set(account.id, { ...account });
  }

  async get(id: Id): Promise<Account | null> {
    const acc = this.accounts.get(id);
    return acc ? { ...acc } : null;
  }

  async getByCode(tenantId: Id, code: string): Promise<Account | null> {
    for (const acc of this.accounts.values()) {
      if (acc.tenantId === tenantId && acc.code === code) {
        return { ...acc };
      }
    }
    return null;
  }

  async list(filter: AccountFilter = {}): Promise<Account[]> {
    let out = [...this.accounts.values()];
    if (filter.tenantId) out = out.filter((a) => a.tenantId === filter.tenantId);
    if (filter.type) out = out.filter((a) => a.type === filter.type);
    return out;
  }
}
