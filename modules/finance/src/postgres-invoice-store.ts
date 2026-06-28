import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Invoice } from './domain/invoice';
import type { InvoiceFilter, InvoiceStore } from './invoice-store';

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
  wbs_node_id: string | null;
  status: string;
  value: string | number;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, reference, title, po_id, po_title, supplier_name, project_id, project_name, wbs_node_id, status, value, owner_id, created_by, created_at';

function rowToInvoice(r: Row): Invoice {
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
    wbsNodeId: r.wbs_node_id,
    status: r.status as Invoice['status'],
    value: Number(r.value),
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable invoices on Postgres (`aura_finance_invoices`). */
export class PostgresInvoiceStore implements InvoiceStore {
  constructor(private readonly pool: Pool) {}

  async create(i: Invoice): Promise<void> {
    await this.insert(this.pool, i);
  }

  async createWithClient(tx: TxHandle | null, i: Invoice): Promise<void> {
    if (tx === null) return this.create(i);
    await this.insert(tx as PoolClient, i);
  }

  private insert(executor: Pool | PoolClient, i: Invoice): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_finance_invoices (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [i.id, i.tenantId, i.companyId, i.reference, i.title, i.poId, i.poTitle, i.supplierName, i.projectId, i.projectName, i.wbsNodeId, i.status, i.value, i.ownerId, i.createdBy, i.createdAt],
    );
  }

  async update(i: Invoice): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_finance_invoices SET title=$2, reference=$3, status=$4, value=$5, owner_id=$6, wbs_node_id=$7 WHERE id=$1`,
      [i.id, i.title, i.reference, i.status, i.value, i.ownerId, i.wbsNodeId],
    );
  }

  async get(id: Id): Promise<Invoice | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_invoices WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToInvoice(res.rows[0]) : null;
  }

  async list(filter: InvoiceFilter = {}): Promise<Invoice[]> {
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
      `SELECT ${COLS} FROM public.aura_finance_invoices ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToInvoice);
  }
}
