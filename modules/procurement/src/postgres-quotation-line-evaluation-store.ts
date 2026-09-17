import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { QuotationLineEvaluation, TechnicalVerdict } from './domain/quotation-line-evaluation';
import type { QuotationLineEvaluationStore } from './quotation-line-evaluation.store';

interface Row {
  id: string; tenant_id: string; company_id: string | null; quotation_line_id: string;
  verdict: string; rationale: string; decided_by: string; decided_at: Date | string;
  supersedes_id: string | null; amendment_reason: string | null;
  superseded_at: Date | string | null; superseded_by: string | null; created_at: Date | string;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

const COLS =
  'id, tenant_id, company_id, quotation_line_id, verdict, rationale, decided_by, decided_at, ' +
  'supersedes_id, amendment_reason, superseded_at, superseded_by, created_at';

const fromRow = (r: Row): QuotationLineEvaluation => ({
  id: r.id, tenantId: r.tenant_id, companyId: r.company_id,
  quotationLineId: r.quotation_line_id,
  verdict: r.verdict as TechnicalVerdict, rationale: r.rationale,
  decidedBy: r.decided_by, decidedAt: iso(r.decided_at),
  supersedesId: r.supersedes_id, amendmentReason: r.amendment_reason,
  supersededAt: r.superseded_at === null ? null : iso(r.superseded_at),
  supersededBy: r.superseded_by, createdAt: iso(r.created_at),
});

export class PostgresQuotationLineEvaluationStore implements QuotationLineEvaluationStore {
  constructor(private readonly pool: Pool) {}

  async create(e: QuotationLineEvaluation): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_procurement_quotation_line_evaluations (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [e.id, e.tenantId, e.companyId, e.quotationLineId, e.verdict, e.rationale, e.decidedBy,
       e.decidedAt, e.supersedesId, e.amendmentReason, e.supersededAt, e.supersededBy, e.createdAt],
    );
  }

  async findCurrent(tenantId: Id, quotationLineId: Id): Promise<QuotationLineEvaluation | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_quotation_line_evaluations
        WHERE tenant_id = $1 AND quotation_line_id = $2 AND superseded_at IS NULL`,
      [tenantId, quotationLineId],
    );
    return res.rows[0] ? fromRow(res.rows[0]) : null;
  }

  async listForLine(tenantId: Id, quotationLineId: Id): Promise<QuotationLineEvaluation[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_procurement_quotation_line_evaluations
        WHERE tenant_id = $1 AND quotation_line_id = $2 ORDER BY decided_at DESC`,
      [tenantId, quotationLineId],
    );
    return res.rows.map(fromRow);
  }

  async markSuperseded(id: Id, supersededAt: string, supersededBy: Id): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_procurement_quotation_line_evaluations
          SET superseded_at = $2, superseded_by = $3 WHERE id = $1`,
      [id, supersededAt, supersededBy],
    );
  }
}
