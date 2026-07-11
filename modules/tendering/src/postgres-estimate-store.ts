import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { CostComponent, RateBuildUp, ResourceBreakdown } from './domain/estimate';
import type { EstimateStore } from './estimate-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  tender_id: string;
  boq_item_id: string;
  components: unknown;
  resources: unknown;
  direct_cost: string | number;
  overhead_percent: string | number;
  profit_percent: string | number;
  overhead_amount: string | number;
  profit_amount: string | number;
  selling_rate: string | number;
  notes: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, tender_id, boq_item_id, components, resources, direct_cost, overhead_percent, profit_percent, overhead_amount, profit_amount, selling_rate, notes, created_by, created_at';

function rowToBuildUp(r: Row): RateBuildUp {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    tenderId: r.tender_id,
    boqItemId: r.boq_item_id,
    components: (typeof r.components === 'string' ? JSON.parse(r.components) : r.components) as CostComponent[],
    resources: (r.resources == null ? null : typeof r.resources === 'string' ? JSON.parse(r.resources) : r.resources) as ResourceBreakdown | null,
    directCost: Number(r.direct_cost),
    overheadPercent: Number(r.overhead_percent),
    profitPercent: Number(r.profit_percent),
    overheadAmount: Number(r.overhead_amount),
    profitAmount: Number(r.profit_amount),
    sellingRate: Number(r.selling_rate),
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable rate build-ups on Postgres (`aura_tendering_rate_buildups`). */
export class PostgresEstimateStore implements EstimateStore {
  constructor(private readonly pool: Pool) {}

  async save(b: RateBuildUp): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_tendering_rate_buildups (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO UPDATE SET
         components = EXCLUDED.components, resources = EXCLUDED.resources, direct_cost = EXCLUDED.direct_cost,
         overhead_percent = EXCLUDED.overhead_percent, profit_percent = EXCLUDED.profit_percent,
         overhead_amount = EXCLUDED.overhead_amount, profit_amount = EXCLUDED.profit_amount,
         selling_rate = EXCLUDED.selling_rate, notes = EXCLUDED.notes`,
      [b.id, b.tenantId, b.companyId, b.tenderId, b.boqItemId, JSON.stringify(b.components), b.resources === null ? null : JSON.stringify(b.resources), b.directCost, b.overheadPercent, b.profitPercent, b.overheadAmount, b.profitAmount, b.sellingRate, b.notes, b.createdBy, b.createdAt],
    );
  }

  async get(id: Id): Promise<RateBuildUp | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_tendering_rate_buildups WHERE id = $1`, [id]);
    return res.rows.length ? rowToBuildUp(res.rows[0]) : null;
  }

  async getByBoqItem(tenantId: string, boqItemId: Id): Promise<RateBuildUp | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_rate_buildups WHERE tenant_id = $1 AND boq_item_id = $2`,
      [tenantId, boqItemId],
    );
    return res.rows.length ? rowToBuildUp(res.rows[0]) : null;
  }

  async listByTender(tenantId: string, tenderId: Id): Promise<RateBuildUp[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_rate_buildups WHERE tenant_id = $1 AND tender_id = $2 ORDER BY created_at DESC`,
      [tenantId, tenderId],
    );
    return res.rows.map(rowToBuildUp);
  }

  async listByTenant(tenantId: string): Promise<RateBuildUp[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_rate_buildups WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return res.rows.map(rowToBuildUp);
  }

  async delete(id: Id): Promise<void> {
    await this.pool.query(`DELETE FROM public.aura_tendering_rate_buildups WHERE id = $1`, [id]);
  }
}
