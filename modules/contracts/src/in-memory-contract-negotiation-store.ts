import type { Id } from '@aura/shared';
import type { ContractNegotiationItem } from './domain/contract-negotiation';
import type { ContractNegotiationStore } from './contract-negotiation-store';

export class InMemoryContractNegotiationStore implements ContractNegotiationStore {
  private readonly rows = new Map<Id, ContractNegotiationItem>();
  async create(item: ContractNegotiationItem): Promise<void> { this.rows.set(item.id, structuredClone(item)); }
  async get(id: Id): Promise<ContractNegotiationItem | null> { const item = this.rows.get(id); return item ? structuredClone(item) : null; }
  async list(tenantId: Id, contractId: Id, revisionId?: Id): Promise<ContractNegotiationItem[]> {
    return [...this.rows.values()]
      .filter((x) => x.tenantId === tenantId && x.contractId === contractId && (!revisionId || x.revisionId === revisionId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((x) => structuredClone(x));
  }
  async update(item: ContractNegotiationItem): Promise<void> {
    if (!this.rows.has(item.id)) throw new Error(`negotiation item ${item.id} not found`);
    this.rows.set(item.id, structuredClone(item));
  }
}

