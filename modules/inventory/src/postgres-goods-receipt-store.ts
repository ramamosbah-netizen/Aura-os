import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { GoodsReceipt } from './domain/goods-receipt';
import type { GoodsReceiptFilter, GoodsReceiptStore } from './goods-receipt-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  reference: string | null;
  title: string;
  po_id: string | null;
  po_title: string | null;
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
  'id, tenant_id, company_id, reference, title, po_id, po_title, supplier_name, project_id, project_name, status, value, owner_id, created_by, created_at';

function rowToGrn(r: Row): GoodsReceipt {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    reference: r.reference,
    title: r.title,
    poId: r.po_id,
    poTitle: r.po_title,
    supplierName: r.supplier_name,
    projectId: r.project_id,
    projectName: r.project_name,
    status: r.status as GoodsReceipt['status'],
    value: Number(r.value),
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable goods receipts on Postgres (`aura_inventory_grns`). */
export class PostgresGoodsReceiptStore implements GoodsReceiptStore {
  constructor(private readonly pool: Pool) {}

  async create(g: GoodsReceipt): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_inventory_grns (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [g.id, g.tenantId, g.companyId, g.reference, g.title, g.poId, g.poTitle, g.supplierName, g.projectId, g.projectName, g.status, g.value, g.ownerId, g.createdBy, g.createdAt],
    );
  }

  async get(id: Id): Promise<GoodsReceipt | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_inventory_grns WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToGrn(res.rows[0]) : null;
  }

  async list(filter: GoodsReceiptFilter = {}): Promise<GoodsReceipt[]> {
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
    add('po_id', filter.poId);
    add('project_id', filter.projectId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_inventory_grns ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToGrn);
  }
}
