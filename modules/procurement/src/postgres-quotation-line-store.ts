import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ComplianceResponse, QuotationLine, QuoteResponse } from './domain/quotation-line';
import type { QuotationLineStore } from './quotation-line.store';

interface Row {
  id: string; tenant_id: string; company_id: string | null; pr_line_id: string;
  revision_id: string; supplier_description: string | null; part_number: string | null;
  commercial_deviation: string | null;
  response: string; offered_manufacturer: string | null; offered_model: string | null;
  compliance_response: string | null; deviations: string | null;
  exclusions: string | null; quantity: string | number | null; uom: string | null;
  unit_price: string | number | null; line_discount: string | number | null;
  line_discount_basis: string | null;
  lead_time_days: number | null; warranty_months: number | null; notes: string | null;
  created_by: string | null; created_at: Date | string; updated_at: Date | string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));
const num = (v: string | number | null): number | null => (v === null ? null : Number(v));

const COLS =
  'id, tenant_id, company_id, revision_id, pr_line_id, supplier_description, part_number, ' +
  'commercial_deviation, response, offered_manufacturer, offered_model, ' +
  'compliance_response, deviations, exclusions, quantity, uom, unit_price, line_discount, ' +
  'line_discount_basis, ' +
  'lead_time_days, warranty_months, notes, created_by, created_at, updated_at';

const fromRow = (r: Row): QuotationLine => ({
  id: r.id, tenantId: r.tenant_id, companyId: r.company_id,
  revisionId: r.revision_id, prLineId: r.pr_line_id,
  supplierDescription: r.supplier_description ?? null,
  partNumber: r.part_number ?? null,
  commercialDeviation: r.commercial_deviation ?? null,
  response: r.response as QuoteResponse,
  offeredManufacturer: r.offered_manufacturer, offeredModel: r.offered_model,
  complianceResponse: r.compliance_response as ComplianceResponse | null,
  deviations: r.deviations, exclusions: r.exclusions,
  quantity: num(r.quantity), uom: r.uom, unitPrice: num(r.unit_price), lineDiscount: num(r.line_discount),
  lineDiscountBasis: (r.line_discount_basis as QuotationLine['lineDiscountBasis']) ?? null,
  leadTimeDays: r.lead_time_days, warrantyMonths: r.warranty_months,
  notes: r.notes, createdBy: r.created_by,
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
});

export class PostgresQuotationLineStore implements QuotationLineStore {
  constructor(private readonly pool: Pool) {}

  async create(l: QuotationLine): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_procurement_quotation_lines (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
      [l.id, l.tenantId, l.companyId, l.revisionId, l.prLineId,
       l.supplierDescription, l.partNumber, l.commercialDeviation, l.response,
       l.offeredManufacturer, l.offeredModel, l.complianceResponse,
       l.deviations, l.exclusions, l.quantity, l.uom, l.unitPrice, l.lineDiscount,
       l.lineDiscountBasis, l.leadTimeDays, l.warrantyMonths, l.notes, l.createdBy, l.createdAt, l.updatedAt],
    );
  }

  async update(l: QuotationLine): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_procurement_quotation_lines SET
         response=$2, offered_manufacturer=$3, offered_model=$4,
         compliance_response=$5, deviations=$6, exclusions=$7, quantity=$8, uom=$9,
         unit_price=$10, line_discount=$11, line_discount_basis=$12, lead_time_days=$13,
         warranty_months=$14, notes=$15, updated_at=$16
       WHERE id=$1`,
      [l.id, l.response, l.offeredManufacturer, l.offeredModel,
       l.complianceResponse, l.deviations, l.exclusions, l.quantity, l.uom,
       l.unitPrice, l.lineDiscount, l.lineDiscountBasis, l.leadTimeDays, l.warrantyMonths,
       l.notes, l.updatedAt],
    );
  }

  async get(id: Id): Promise<QuotationLine | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_quotation_lines WHERE id = $1`, [id],
    );
    return res.rows[0] ? fromRow(res.rows[0]) : null;
  }

  async remove(id: Id): Promise<void> {
    await this.pool.query('DELETE FROM public.aura_procurement_quotation_lines WHERE id = $1', [id]);
  }

  async listByRevision(tenantId: Id, revisionId: Id): Promise<QuotationLine[]> {
    const res = await this.pool.query(
      `SELECT ${COLS} FROM public.aura_procurement_quotation_lines
        WHERE tenant_id = $1 AND revision_id = $2 ORDER BY created_at`,
      [tenantId, revisionId],
    );
    return res.rows.map(fromRow);
  }

  async listByRequirement(tenantId: Id, prLineId: Id): Promise<QuotationLine[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_quotation_lines
        WHERE tenant_id = $1 AND pr_line_id = $2 ORDER BY created_at ASC`,
      [tenantId, prLineId],
    );
    return res.rows.map(fromRow);
  }
}
