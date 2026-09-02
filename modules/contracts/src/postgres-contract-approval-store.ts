import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ContractApproval, ContractApprovalStatus } from './domain/contract-approval';
import type { ContractApprovalStore } from './contract-approval-store';
const COLS='id,tenant_id,contract_id,target,target_id,submitted_by,submitted_at,status,decided_by,decided_at,comment';
const from=(r:any):ContractApproval=>({id:r.id,tenantId:r.tenant_id,contractId:r.contract_id,target:r.target,targetId:r.target_id,submittedBy:r.submitted_by,submittedAt:new Date(r.submitted_at).toISOString(),status:r.status,decidedBy:r.decided_by,decidedAt:r.decided_at?new Date(r.decided_at).toISOString():null,comment:r.comment});
export class PostgresContractApprovalStore implements ContractApprovalStore {
  constructor(private readonly pool:Pool){}
  async get(t:Id,target:ContractApproval['target'],id:Id){const r=await this.pool.query(`select ${COLS} from public.aura_contract_approvals where tenant_id=$1 and target=$2 and target_id=$3`,[t,target,id]);return r.rows[0]?from(r.rows[0]):null;}
  async create(a:ContractApproval){await this.pool.query(`insert into public.aura_contract_approvals (${COLS}) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[a.id,a.tenantId,a.contractId,a.target,a.targetId,a.submittedBy,a.submittedAt,a.status,a.decidedBy,a.decidedAt,a.comment]);}
  async decide(a:ContractApproval,status:ContractApprovalStatus,actorId:Id,comment?:string){const r=await this.pool.query(`update public.aura_contract_approvals set status=$4, decided_by=$5, decided_at=now(), comment=$6 where tenant_id=$1 and target=$2 and target_id=$3 and status='pending' returning ${COLS}`,[a.tenantId,a.target,a.targetId,status,actorId,comment?.trim()||null]); if(!r.rows[0]){const current=await this.get(a.tenantId,a.target,a.targetId); if(current?.status===status)return current; throw new Error('approval already decided');} return from(r.rows[0]);}
}
