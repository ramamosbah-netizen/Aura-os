import type { Id } from '@aura/shared';
import type { ContractApproval, ContractApprovalStatus } from './domain/contract-approval';
import type { ContractApprovalStore } from './contract-approval-store';
export class InMemoryContractApprovalStore implements ContractApprovalStore {
  private readonly rows = new Map<string, ContractApproval>();
  private key(t: Id, target: string, id: Id) { return `${t}:${target}:${id}`; }
  async get(t: Id, target: ContractApproval['target'], id: Id) { const r=this.rows.get(this.key(t,target,id)); return r ? structuredClone(r) : null; }
  async create(a: ContractApproval) { const k=this.key(a.tenantId,a.target,a.targetId); if(this.rows.has(k)) throw new Error('approval already exists'); this.rows.set(k,structuredClone(a)); }
  async decide(a: ContractApproval, status: ContractApprovalStatus, actorId: Id, comment?: string) { const current=this.rows.get(this.key(a.tenantId,a.target,a.targetId)); if(!current) throw new Error('approval not found'); if(current.status!== 'pending') { if(current.status===status) return structuredClone(current); throw new Error('approval already decided'); } const next={...current,status,decidedBy:actorId,decidedAt:new Date().toISOString(),comment:comment?.trim()||null}; this.rows.set(this.key(a.tenantId,a.target,a.targetId),next); return structuredClone(next); }
}
