import type { Id } from '@aura/shared';
import type { BankGuarantee } from './domain/bank-guarantee';
import type { BankGuaranteeFilter, BankGuaranteeStore } from './bank-guarantee-store';

export class InMemoryBankGuaranteeStore implements BankGuaranteeStore {
  private readonly data = new Map<string, BankGuarantee>();

  async save(g: BankGuarantee): Promise<void> {
    this.data.set(g.id, { ...g });
  }

  async get(id: Id): Promise<BankGuarantee | null> {
    const g = this.data.get(id);
    return g ? { ...g } : null;
  }

  async list(filter: BankGuaranteeFilter = {}): Promise<BankGuarantee[]> {
    let out = [...this.data.values()];
    if (filter.tenantId) out = out.filter((g) => g.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((g) => g.status === filter.status);
    if (filter.projectId) out = out.filter((g) => g.projectId === filter.projectId);
    out.sort((a, b) => (a.expiryDate < b.expiryDate ? -1 : 1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
}
