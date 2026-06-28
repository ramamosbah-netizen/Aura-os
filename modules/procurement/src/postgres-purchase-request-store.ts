import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { PurchaseRequest } from './domain/purchase-request';
import type { PurchaseRequestFilter, PurchaseRequestStore } from './purchase-request-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  reference: string | null;
  title: string;
  project_id: string | null;
  project_name: string | null;
  status: string;
  value: string | number;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, reference, title, project_id, project_name, status, value, owner_id, created_by, created_at';

function rowToPr(r: Row): PurchaseRequest {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    reference: r.reference,
    title: r.title,
    projectId: r.project_id,
    projectName: r.project_name,
    status: r.status as PurchaseRequest['status'],
    value: Number(r.value),
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export class PostgresPurchaseRequestStore implements PurchaseRequestStore {
  constructor(private readonly pool: Pool) {}

  async create(pr: PurchaseRequest): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_procurement_purchase_requests (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        pr.id,
        pr.tenantId,
        pr.companyId,
        pr.reference,
        pr.title,
        pr.projectId,
        pr.projectName,
        pr.status,
        pr.value,
        pr.ownerId,
        pr.createdBy,
        pr.createdAt,
      ],
    );
  }

  async update(pr: PurchaseRequest): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_procurement_purchase_requests SET reference=$2, title=$3, status=$4, value=$5, owner_id=$6 WHERE id=$1`,
      [pr.id, pr.reference, pr.title, pr.status, pr.value, pr.ownerId],
    );
  }

  async get(id: Id): Promise<PurchaseRequest | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_purchase_requests WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToPr(res.rows[0]) : null;
  }

  async list(filter: PurchaseRequestFilter = {}): Promise<PurchaseRequest[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('project_id', filter.projectId);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_purchase_requests ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToPr);
  }
}
