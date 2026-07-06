import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
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
  discipline: string;
  status: string;
  value: string | number;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, reference, title, project_id, project_name, discipline, status, value, owner_id, created_by, created_at';

function rowToPr(r: Row): PurchaseRequest {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    reference: r.reference,
    title: r.title,
    projectId: r.project_id,
    projectName: r.project_name,
    discipline: r.discipline as PurchaseRequest['discipline'],
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
      `INSERT INTO public.aura_procurement_purchase_requests (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        pr.id,
        pr.tenantId,
        pr.companyId,
        pr.reference,
        pr.title,
        pr.projectId,
        pr.projectName,
        pr.discipline,
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
      `UPDATE public.aura_procurement_purchase_requests SET reference=$2, title=$3, discipline=$4, status=$5, value=$6, owner_id=$7 WHERE id=$1`,
      [pr.id, pr.reference, pr.title, pr.discipline, pr.status, pr.value, pr.ownerId],
    );
  }

  async get(id: Id): Promise<PurchaseRequest | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_purchase_requests WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToPr(res.rows[0]) : null;
  }

  private buildWhere(filter: PurchaseRequestFilter): { whereSql: string; params: unknown[] } {
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
    add('discipline', filter.discipline);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: PurchaseRequestFilter = {}): Promise<PurchaseRequest[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_purchase_requests ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToPr);
  }

  async listPaged(filter: PurchaseRequestFilter, page: PageParams): Promise<Page<PurchaseRequest>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_procurement_purchase_requests ${whereSql}`,
      params,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_purchase_requests ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToPr), total, page);
  }
}
