import type { Id } from '@aura/shared';
import type { ContractBond } from './domain/contract-bond';
import type { BondFilter, BondStore } from './bond-store';

/** Phase-0 bond store — in memory (no-DB boots). */
export class InMemoryBondStore implements BondStore {
  private readonly bonds = new Map<string, ContractBond>();

  async save(b: ContractBond): Promise<void> {
    this.bonds.set(b.id, { ...b });
  }

  async get(id: Id): Promise<ContractBond | null> {
    const b = this.bonds.get(id);
    return b ? { ...b } : null;
  }

  async list(filter: BondFilter = {}): Promise<ContractBond[]> {
    let out = [...this.bonds.values()];
    if (filter.tenantId) out = out.filter((b) => b.tenantId === filter.tenantId);
    if (filter.contractId) out = out.filter((b) => b.contractId === filter.contractId);
    if (filter.status) out = out.filter((b) => b.status === filter.status);
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((b) => ({ ...b }));
  }
}
