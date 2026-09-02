import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ContractClientShare } from './domain/contract-client-share';
import type { ContractClientShareStore } from './contract-client-share-store';
const COLS='id,tenant_id,contract_id,revision_id,recipient,method,state,shared_by,shared_at,correlation_id,failure_reason';
type Row={id:string;tenant_id:string;contract_id:string;revision_id:string;recipient:string;method:string;state:string;shared_by:string|null;shared_at:Date|string;correlation_id:string;failure_reason:string|null};
const iso=(v:Date|string)=>v instanceof Date?v.toISOString():String(v);
const from=(r:Row):ContractClientShare=>({id:r.id,tenantId:r.tenant_id,contractId:r.contract_id,revisionId:r.revision_id,recipient:r.recipient,method:r.method as ContractClientShare['method'],state:r.state as ContractClientShare['state'],sharedBy:r.shared_by,sharedAt:iso(r.shared_at),correlationId:r.correlation_id,failureReason:r.failure_reason});
export class PostgresContractClientShareStore implements ContractClientShareStore {
  constructor(private readonly pool:Pool){}
  async create(s:ContractClientShare){await this.pool.query(`INSERT INTO public.aura_contracts_client_shares (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[s.id,s.tenantId,s.contractId,s.revisionId,s.recipient,s.method,s.state,s.sharedBy,s.sharedAt,s.correlationId,s.failureReason]);}
  async get(id:Id){const q=await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_contracts_client_shares WHERE id=$1`,[id]);return q.rows[0]?from(q.rows[0]):null;}
  async list(tenantId:Id,contractId:Id){const q=await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_contracts_client_shares WHERE tenant_id=$1 AND contract_id=$2 ORDER BY shared_at`,[tenantId,contractId]);return q.rows.map(from);}
  async update(s:ContractClientShare){const q=await this.pool.query(`UPDATE public.aura_contracts_client_shares SET state=$2,failure_reason=$3 WHERE id=$1 AND tenant_id=$4 AND state='prepared'`,[s.id,s.state,s.failureReason,s.tenantId]);if(q.rowCount!==1)throw new Error('client share changed concurrently or is already dispatched');}
}

