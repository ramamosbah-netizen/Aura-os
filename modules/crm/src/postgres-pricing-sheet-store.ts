import type { Pool } from 'pg';
import type { Id, EstimationLineInput } from '@aura/shared';
import type { PricingSheet, PricingSheetStatus } from './domain/pricing-sheet';
import type { PricingSheetFilter, PricingSheetStore } from './pricing-sheet-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  name: string;
  opportunity_id: string | null;
  quotation_id: string | null;
  version: number | string;
  parent_sheet_id: string | null;
  status: string;
  lines: EstimationLineInput[] | string;
  total_cost: string | number;
  total_sell: string | number;
  margin_percent: string | number;
  frozen_at: Date | string | null;
  frozen_by: string | null;
  created_at: Date | string;
  created_by: string | null;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

function rowTo(r: Row): PricingSheet {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    name: r.name,
    opportunityId: r.opportunity_id,
    quotationId: r.quotation_id,
    version: Number(r.version),
    parentSheetId: r.parent_sheet_id,
    status: r.status as PricingSheetStatus,
    lines: typeof r.lines === 'string' ? (JSON.parse(r.lines) as EstimationLineInput[]) : r.lines,
    totals: {
      totalCost: Number(r.total_cost),
      totalSell: Number(r.total_sell),
      marginPercent: Number(r.margin_percent),
    },
    frozenAt: r.frozen_at ? iso(r.frozen_at) : null,
    frozenBy: r.frozen_by,
    createdAt: iso(r.created_at),
    createdBy: r.created_by,
  };
}

const COLS =
  'id, tenant_id, company_id, name, opportunity_id, quotation_id, version, parent_sheet_id, status, lines, total_cost, total_sell, margin_percent, frozen_at, frozen_by, created_at, created_by';

export class PostgresPricingSheetStore implements PricingSheetStore {
  constructor(private readonly pool: Pool) {}

  async save(s: PricingSheet): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_pricing_sheets (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, opportunity_id = EXCLUDED.opportunity_id, quotation_id = EXCLUDED.quotation_id,
         status = EXCLUDED.status, lines = EXCLUDED.lines,
         total_cost = EXCLUDED.total_cost, total_sell = EXCLUDED.total_sell, margin_percent = EXCLUDED.margin_percent,
         frozen_at = EXCLUDED.frozen_at, frozen_by = EXCLUDED.frozen_by`,
      [s.id, s.tenantId, s.companyId, s.name, s.opportunityId, s.quotationId, s.version, s.parentSheetId,
       s.status, JSON.stringify(s.lines), s.totals.totalCost, s.totals.totalSell, s.totals.marginPercent,
       s.frozenAt, s.frozenBy, s.createdAt, s.createdBy],
    );
  }

  async get(id: Id): Promise<PricingSheet | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_crm_pricing_sheets WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async list(filter: PricingSheetFilter): Promise<PricingSheet[]> {
    const params: unknown[] = [filter.tenantId];
    let sql = `SELECT ${COLS} FROM public.aura_crm_pricing_sheets WHERE tenant_id = $1`;
    if (filter.opportunityId) { params.push(filter.opportunityId); sql += ` AND opportunity_id = $${params.length}`; }
    if (filter.quotationId) { params.push(filter.quotationId); sql += ` AND quotation_id = $${params.length}`; }
    params.push(filter.limit ?? 50);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    const res = await this.pool.query<Row>(sql, params);
    return res.rows.map(rowTo);
  }

  async remove(id: Id): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM public.aura_crm_pricing_sheets WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
