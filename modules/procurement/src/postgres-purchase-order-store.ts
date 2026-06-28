import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { PurchaseOrder } from './domain/purchase-order';
import type { PurchaseOrderFilter, PurchaseOrderStore } from './purchase-order-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  reference: string | null;
  title: string;
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
  'id, tenant_id, company_id, reference, title, supplier_name, project_id, project_name, status, value, owner_id, created_by, created_at';

function rowToPo(r: Row): PurchaseOrder {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    reference: r.reference,
    title: r.title,
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
      `INSERT INTO public.aura_procurement_purchase_orders (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [p.id, p.tenantId, p.companyId, p.reference, p.title, p.supplierName, p.projectId, p.projectName, p.status, p.value, p.ownerId, p.createdBy, p.createdAt],
    );
  }

  async update(p: PurchaseOrder): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_procurement_purchase_orders SET reference=$2, title=$3, supplier_name=$4, status=$5, value=$6, owner_id=$7 WHERE id=$1`,
      [p.id, p.reference, p.title, p.supplierName, p.status, p.value, p.ownerId],
    );
  }

  async get(id: Id): Promise<PurchaseOrder | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_purchase_orders WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToPo(res.rows[0]) : null;
  }

  async list(filter: PurchaseOrderFilter = {}): Promise<PurchaseOrder[]> {
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
      `SELECT ${COLS} FROM public.aura_procurement_purchase_orders ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToPo);
  }
}
