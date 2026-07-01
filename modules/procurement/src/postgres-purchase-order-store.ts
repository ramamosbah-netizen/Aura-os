import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { PurchaseOrder } from './domain/purchase-order';
import type { PurchaseOrderFilter, PurchaseOrderStore } from './purchase-order-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  reference: string | null;
  title: string;
  supplier_id: string | null;
  supplier_name: string | null;
  project_id: string | null;
  project_name: string | null;
  status: string;
  value: string | number;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, reference, title, supplier_id, supplier_name, project_id, project_name, status, value, owner_id, created_by, created_at';

function rowToPo(r: Row): PurchaseOrder {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    reference: r.reference,
    title: r.title,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    projectId: r.project_id,
    projectName: r.project_name,
    status: r.status as PurchaseOrder['status'],
    value: Number(r.value),
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable purchase orders on Postgres (`aura_procurement_purchase_orders`). */
export class PostgresPurchaseOrderStore implements PurchaseOrderStore {
  constructor(private readonly pool: Pool) {}

  async create(p: PurchaseOrder): Promise<void> {
    await this.insert(this.pool, p);
  }

  async createWithClient(tx: TxHandle | null, p: PurchaseOrder): Promise<void> {
    if (tx === null) return this.create(p);
    await this.insert(tx as PoolClient, p);
  }

  private insert(executor: Pool | PoolClient, p: PurchaseOrder): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_procurement_purchase_orders (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [p.id, p.tenantId, p.companyId, p.reference, p.title, p.supplierId, p.supplierName, p.projectId, p.projectName, p.status, p.value, p.ownerId, p.createdBy, p.createdAt],
    );
  }

  async update(p: PurchaseOrder): Promise<void> {
    await this.upd(this.pool, p);
  }

  async updateWithClient(tx: TxHandle | null, p: PurchaseOrder): Promise<void> {
    if (tx === null) return this.update(p);
    await this.upd(tx as PoolClient, p);
  }

  private upd(executor: Pool | PoolClient, p: PurchaseOrder): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_procurement_purchase_orders SET reference=$2, title=$3, supplier_id=$4, supplier_name=$5, status=$6, value=$7, owner_id=$8 WHERE id=$1`,
      [p.id, p.reference, p.title, p.supplierId, p.supplierName, p.status, p.value, p.ownerId],
    );
  }

  async get(id: Id): Promise<PurchaseOrder | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_purchase_orders WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToPo(res.rows[0]) : null;
  }

  private buildWhere(filter: PurchaseOrderFilter): { whereSql: string; params: unknown[] } {
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
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: PurchaseOrderFilter = {}): Promise<PurchaseOrder[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_purchase_orders ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToPo);
  }

  async listPaged(filter: PurchaseOrderFilter, page: PageParams): Promise<Page<PurchaseOrder>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_procurement_purchase_orders ${whereSql}`,
      params,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_purchase_orders ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToPo), total, page);
  }
}
