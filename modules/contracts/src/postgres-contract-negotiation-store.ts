import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ContractNegotiationItem } from './domain/contract-negotiation';
import type { ContractNegotiationStore } from './contract-negotiation-store';

const COLS = 'id, tenant_id, contract_id, revision_id, item_type, content, visibility, status, owner_id, resolution, created_by, created_at, resolved_at';
type Row = { id:string; tenant_id:string; contract_id:string; revision_id:string; item_type:string; content:string; visibility:string; status:string; owner_id:string|null; resolution:string|null; created_by:string|null; created_at:Date|string; resolved_at:Date|string|null };
const iso = (v: Date|string|null): string|null => v === null ? null : v instanceof Date ? v.toISOString() : String(v);
const from = (r: Row): ContractNegotiationItem => ({
  id:r.id, tenantId:r.tenant_id, contractId:r.contract_id, revisionId:r.revision_id, type:r.item_type as ContractNegotiationItem['type'],
  content:r.content, visibility:r.visibility as ContractNegotiationItem['visibility'], status:r.status as ContractNegotiationItem['status'],
  ownerId:r.owner_id, resolution:r.resolution, createdBy:r.created_by, createdAt:iso(r.created_at)!, resolvedAt:iso(r.resolved_at),
});

export class PostgresContractNegotiationStore implements ContractNegotiationStore {
  constructor(private readonly pool: Pool) {}
  async create(i: ContractNegotiationItem): Promise<void> {
    await this.pool.query(`INSERT INTO public.aura_contracts_negotiation_items (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [i.id,i.tenantId,i.contractId,i.revisionId,i.type,i.content,i.visibility,i.status,i.ownerId,i.resolution,i.createdBy,i.createdAt,i.resolvedAt]);
  }
  async get(id: Id): Promise<ContractNegotiationItem|null> { const q = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_contracts_negotiation_items WHERE id=$1`, [id]); return q.rows[0] ? from(q.rows[0]) : null; }
  async list(tenantId: Id, contractId: Id, revisionId?: Id): Promise<ContractNegotiationItem[]> {
    const args: unknown[] = [tenantId, contractId]; let where = 'tenant_id=$1 AND contract_id=$2';
    if (revisionId) { args.push(revisionId); where += ' AND revision_id=$3'; }
    const q = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_contracts_negotiation_items WHERE ${where} ORDER BY created_at`, args); return q.rows.map(from);
  }
  async update(i: ContractNegotiationItem): Promise<void> {
    const result = await this.pool.query(`UPDATE public.aura_contracts_negotiation_items SET status=$2,resolution=$3,resolved_at=$4 WHERE id=$1 AND tenant_id=$5 AND status='open'`, [i.id,i.status,i.resolution,i.resolvedAt,i.tenantId]);
    if (result.rowCount !== 1) throw new Error('negotiation item changed concurrently or is already closed');
  }
}

