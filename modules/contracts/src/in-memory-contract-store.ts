import type { Id } from '@aura/shared';
import type { Contract } from './domain/contract';
import type { ContractFilter, ContractStore } from './contract-store';

/** Phase-0 contract store — keeps contracts in memory (no-DB boots). */
export class InMemoryContractStore implements ContractStore {
  private readonly contracts = new Map<string, Contract>();

  async create(contract: Contract): Promise<void> {
    this.contracts.set(contract.id, { ...contract });
  }

  async get(id: Id): Promise<Contract | null> {
    const c = this.contracts.get(id);
    return c ? { ...c } : null;
  }

  async list(filter: ContractFilter = {}): Promise<Contract[]> {
    let out = [...this.contracts.values()];
    if (filter.tenantId) out = out.filter((c) => c.tenantId === filter.tenantId);
    if (filter.status) out = out.filter((c) => c.status === filter.status);
    if (filter.accountId) out = out.filter((c) => c.accountId === filter.accountId);
    if (filter.tenderId) out = out.filter((c) => c.tenderId === filter.tenderId);
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return filter.limit ? out.slice(0, filter.limit) : out;
  }
}
