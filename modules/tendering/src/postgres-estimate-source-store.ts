import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { EstimateSource } from './domain/estimate-source';
import type { EstimateSourceStore } from './estimate-source-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  tender_id: string;
  buildup_id: string;
  boq_item_id: string;
  component_id: string;
  rfq_id: string;
  quote_id: string;
  supplier_name: string;
  sourced_unit_cost: string | number;
  previous_unit_cost: string | number;
  sourced_at: Date | string;
  created_by: string | null;
}

const COLS =
  'id, tenant_id, company_id, tender_id, buildup_id, boq_item_id, component_id, rfq_id, quote_id, supplier_name, sourced_unit_cost, previous_unit_cost, sourced_at, created_by';

function toSource(r: Row): EstimateSource {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    tenderId: r.tender_id,
    buildUpId: r.buildup_id,
    boqItemId: r.boq_item_id,
    componentId: r.component_id,
    rfqId: r.rfq_id,
    quoteId: r.quote_id,
    supplierName: r.supplier_name,
    sourcedUnitCost: Number(r.sourced_unit_cost),
    previousUnitCost: Number(r.previous_unit_cost),
    sourcedAt: r.sourced_at instanceof Date ? r.sourced_at.toISOString() : String(r.sourced_at),
    createdBy: r.created_by,
  };
}

/** Durable estimate sources on Postgres (`aura_tendering_estimate_sources`). */
export class PostgresEstimateSourceStore implements EstimateSourceStore {
  constructor(private readonly pool: Pool) {}

  async upsert(s: EstimateSource): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_tendering_estimate_sources (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (buildup_id, component_id) DO UPDATE SET
         rfq_id = EXCLUDED.rfq_id, quote_id = EXCLUDED.quote_id, supplier_name = EXCLUDED.supplier_name,
         sourced_unit_cost = EXCLUDED.sourced_unit_cost, previous_unit_cost = EXCLUDED.previous_unit_cost,
         sourced_at = EXCLUDED.sourced_at`,
      [s.id, s.tenantId, s.companyId, s.tenderId, s.buildUpId, s.boqItemId, s.componentId, s.rfqId, s.quoteId, s.supplierName, s.sourcedUnitCost, s.previousUnitCost, s.sourcedAt, s.createdBy],
    );
  }

  async getByComponent(tenantId: Id, buildUpId: Id, componentId: Id): Promise<EstimateSource | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_estimate_sources WHERE tenant_id = $1 AND buildup_id = $2 AND component_id = $3`,
      [tenantId, buildUpId, componentId],
    );
    return res.rows.length ? toSource(res.rows[0]) : null;
  }

  async listByTender(tenantId: Id, tenderId: Id): Promise<EstimateSource[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_estimate_sources WHERE tenant_id = $1 AND tender_id = $2 ORDER BY sourced_at DESC`,
      [tenantId, tenderId],
    );
    return res.rows.map(toSource);
  }

  async listByBuildUp(tenantId: Id, buildUpId: Id): Promise<EstimateSource[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_estimate_sources WHERE tenant_id = $1 AND buildup_id = $2`,
      [tenantId, buildUpId],
    );
    return res.rows.map(toSource);
  }

  async listByRfq(tenantId: Id, rfqId: Id): Promise<EstimateSource[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_estimate_sources WHERE tenant_id = $1 AND rfq_id = $2`,
      [tenantId, rfqId],
    );
    return res.rows.map(toSource);
  }

  async remove(tenantId: Id, buildUpId: Id, componentId: Id): Promise<void> {
    await this.pool.query(
      `DELETE FROM public.aura_tendering_estimate_sources WHERE tenant_id = $1 AND buildup_id = $2 AND component_id = $3`,
      [tenantId, buildUpId, componentId],
    );
  }

  async removeByBuildUp(tenantId: Id, buildUpId: Id): Promise<void> {
    await this.pool.query(
      `DELETE FROM public.aura_tendering_estimate_sources WHERE tenant_id = $1 AND buildup_id = $2`,
      [tenantId, buildUpId],
    );
  }
}
