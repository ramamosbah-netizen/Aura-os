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
  cbs_node_id: string | null;
  discipline: string;
  status: string;
  value: string | number;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
  boq_item_id: string | null;
  ordered_quantity: string | number | null;
  unit: string | null;
  rfq_id: string | null;
  pr_id: string | null;
  currency: string | null;
  sourcing_recommendation_id: string | null;
  recommendation_selection_id: string | null;
  quotation_revision_id: string | null;
  supplier_quotation_ref: string | null;
  tax_treatment: string | null;
  tax_rate_pct: string | number | null;
  freight_amount: string | number | null;
  freight_terms: string | null;
  payment_terms: string | null;
}

// The supplier's own terms are read and written here, not just added to the schema: a column the
// store never selects is a term that was carried across in the domain and silently lost on the way
// to the database (migration 0354).
const COLS =
  'id, tenant_id, company_id, reference, title, supplier_id, supplier_name, project_id, project_name, cbs_node_id, discipline, status, value, owner_id, created_by, created_at, boq_item_id, ordered_quantity, unit, rfq_id, pr_id, currency, sourcing_recommendation_id, recommendation_selection_id, quotation_revision_id, supplier_quotation_ref, tax_treatment, tax_rate_pct, freight_amount, freight_terms, payment_terms';

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
    cbsNodeId: r.cbs_node_id,
    discipline: r.discipline as PurchaseOrder['discipline'],
    status: r.status as PurchaseOrder['status'],
    value: Number(r.value),
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    boqItemId: r.boq_item_id,
    orderedQuantity: r.ordered_quantity != null ? Number(r.ordered_quantity) : null,
    unit: r.unit,
    rfqId: r.rfq_id,
    prId: r.pr_id,
    currency: r.currency,
    sourcingRecommendationId: r.sourcing_recommendation_id,
    recommendationSelectionId: r.recommendation_selection_id,
    quotationRevisionId: r.quotation_revision_id,
    supplierQuotationRef: r.supplier_quotation_ref,
    taxTreatment: (r.tax_treatment as PurchaseOrder['taxTreatment']) ?? null,
    taxRatePct: r.tax_rate_pct != null ? Number(r.tax_rate_pct) : null,
    freightAmount: r.freight_amount != null ? Number(r.freight_amount) : null,
    freightTerms: r.freight_terms,
    paymentTerms: r.payment_terms,
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
      `INSERT INTO public.aura_procurement_purchase_orders (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
      [p.id, p.tenantId, p.companyId, p.reference, p.title, p.supplierId, p.supplierName, p.projectId, p.projectName, p.cbsNodeId, p.discipline, p.status, p.value, p.ownerId, p.createdBy, p.createdAt, p.boqItemId, p.orderedQuantity, p.unit, p.rfqId, p.prId, p.currency, p.sourcingRecommendationId, p.recommendationSelectionId, p.quotationRevisionId, p.supplierQuotationRef, p.taxTreatment, p.taxRatePct, p.freightAmount, p.freightTerms, p.paymentTerms],
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
      `UPDATE public.aura_procurement_purchase_orders SET reference=$2, title=$3, supplier_id=$4, supplier_name=$5, discipline=$6, status=$7, value=$8, owner_id=$9 WHERE id=$1`,
      [p.id, p.reference, p.title, p.supplierId, p.supplierName, p.discipline, p.status, p.value, p.ownerId],
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
    add('discipline', filter.discipline);
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
