import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { QuotationReviewDecision, QuotationReviewOutcome } from './domain/quotation-review';
import type { QuotationReviewStore } from './quotation-review-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  quotation_id: string;
  quote_number: string;
  revision: number;
  outcome: string;
  decided_by: string | null;
  decided_at: Date;
  reason: string;
}

const COLS = 'id, tenant_id, company_id, quotation_id, quote_number, revision, outcome, decided_by, decided_at, reason';

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

function rowTo(row: Row): QuotationReviewDecision {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    companyId: row.company_id,
    quotationId: row.quotation_id,
    quoteNumber: row.quote_number,
    revision: Number(row.revision),
    outcome: row.outcome as QuotationReviewOutcome,
    decidedBy: row.decided_by,
    decidedAt: iso(row.decided_at),
    reason: row.reason,
  };
}

/** Append-only: insert and read. No update path — see the store interface. */
export class PostgresQuotationReviewStore implements QuotationReviewStore {
  constructor(private readonly pool: Pool) {}

  async saveWithClient(tx: TxHandle | null, d: QuotationReviewDecision): Promise<void> {
    const executor = (tx as PoolClient | null) ?? this.pool;
    await executor.query(
      `INSERT INTO public.aura_crm_quotation_review_decisions (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [d.id, d.tenantId, d.companyId, d.quotationId, d.quoteNumber, d.revision, d.outcome, d.decidedBy, d.decidedAt, d.reason],
    );
  }

  async listByQuotation(tenantId: Id, quotationId: Id): Promise<QuotationReviewDecision[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_quotation_review_decisions
       WHERE tenant_id = $1 AND quotation_id = $2 ORDER BY decided_at`,
      [tenantId, quotationId],
    );
    return res.rows.map(rowTo);
  }
}
