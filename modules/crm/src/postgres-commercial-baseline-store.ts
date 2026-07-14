import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { QuotationLine } from './domain/quotation';
import type { CommercialBaseline } from './domain/commercial-baseline';
import type { CommercialBaselineStore } from './commercial-baseline-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  quotation_id: string;
  quote_number: string;
  revision: number;
  customer_name: string;
  account_id: string | null;
  source_opportunity_id: string | null;
  source_tender_id: string | null;
  lines: QuotationLine[];
  subtotal: string;
  vat_total: string;
  total: string;
  locked_by: string | null;
  locked_at: Date;
  created_at: Date;
}

const COLS =
  'id, tenant_id, company_id, quotation_id, quote_number, revision, customer_name, account_id, ' +
  'source_opportunity_id, source_tender_id, lines, subtotal, vat_total, total, locked_by, locked_at, created_at';

function rowTo(r: Row): CommercialBaseline {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    quotationId: r.quotation_id,
    quoteNumber: r.quote_number,
    revision: r.revision,
    customerName: r.customer_name,
    accountId: r.account_id,
    sourceOpportunityId: r.source_opportunity_id,
    sourceTenderId: r.source_tender_id,
    lines: r.lines ?? [],
    subtotal: Number(r.subtotal),
    vatTotal: Number(r.vat_total),
    total: Number(r.total),
    lockedBy: r.locked_by,
    lockedAt: r.locked_at.toISOString(),
    createdAt: r.created_at.toISOString(),
  };
}

export class PostgresCommercialBaselineStore implements CommercialBaselineStore {
  constructor(private readonly pool: Pool) {}

  async save(b: CommercialBaseline): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_commercial_baselines (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO NOTHING`,
      [
        b.id, b.tenantId, b.companyId, b.quotationId, b.quoteNumber, b.revision, b.customerName,
        b.accountId, b.sourceOpportunityId, b.sourceTenderId, JSON.stringify(b.lines),
        b.subtotal, b.vatTotal, b.total, b.lockedBy, b.lockedAt, b.createdAt,
      ],
    );
  }

  async get(id: Id): Promise<CommercialBaseline | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_commercial_baselines WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async getByQuotation(tenantId: Id, quotationId: Id): Promise<CommercialBaseline | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_commercial_baselines
       WHERE tenant_id = $1 AND quotation_id = $2 ORDER BY locked_at DESC LIMIT 1`,
      [tenantId, quotationId]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }
}
