import type { Id } from '@aura/shared';
import type { ContractRevision } from './domain/contract-revision';
import type { ContractRevisionStore } from './contract-revision-store';
export class InMemoryContractRevisionStore implements ContractRevisionStore {
  private readonly rows = new Map<Id, ContractRevision>();
  async create(r: ContractRevision): Promise<void> { if ([...this.rows.values()].some((x) => x.tenantId === r.tenantId && x.contractId === r.contractId && x.revisionNumber === r.revisionNumber)) throw new Error('revision number already exists for contract'); this.rows.set(r.id, structuredClone(r)); }
  async get(id: Id): Promise<ContractRevision | null> { const r = this.rows.get(id); return r ? structuredClone(r) : null; }
  async list(tenantId: Id, contractId: Id): Promise<ContractRevision[]> { return [...this.rows.values()].filter((r) => r.tenantId === tenantId && r.contractId === contractId).sort((a,b) => a.revisionNumber-b.revisionNumber).map((r) => structuredClone(r)); }
  async update(r: ContractRevision): Promise<void> { if (!this.rows.has(r.id)) throw new Error(`contract revision ${r.id} not found`); this.rows.set(r.id, structuredClone(r)); }
}
