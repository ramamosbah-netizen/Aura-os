import type { Id } from '@aura/shared';
import type { ContractClientShare } from './domain/contract-client-share';
import type { ContractClientShareStore } from './contract-client-share-store';
export class InMemoryContractClientShareStore implements ContractClientShareStore {
  private readonly rows = new Map<Id, ContractClientShare>();
  async create(s: ContractClientShare) { this.rows.set(s.id, structuredClone(s)); }
  async get(id: Id) { const s=this.rows.get(id); return s ? structuredClone(s) : null; }
  async list(tenantId: Id, contractId: Id) { return [...this.rows.values()].filter(s=>s.tenantId===tenantId&&s.contractId===contractId).sort((a,b)=>a.sharedAt.localeCompare(b.sharedAt)).map(s=>structuredClone(s)); }
  async update(s: ContractClientShare) { if(!this.rows.has(s.id)) throw new Error('client share not found'); this.rows.set(s.id,structuredClone(s)); }
}

