import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { Rfq, RfqQuote } from './domain/rfq';
import type { RfqFilter, RfqStore } from './rfq-store';

interface RfqRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  reference: string | null;
  title: string;
  pr_id: string | null;
  pr_title: string | null;
  status: string;
  due_date: string | null;
  owner_id: string | null;
  sent_by: string | null;
  sent_at: Date | string | null;
  created_by: string | null;
  created_at: Date | string;
}

interface QuoteRow {
  id: string;
  rfq_id: string;
  tenant_id: string;
  company_id: string | null;
  supplier_name: string;
  supplier_id: string | null;
  amount: string | number;
  currency: string | null;
  tax_treatment: string | null;
  tax_rate_pct: string | number | null;
  freight_amount: string | number | null;
  freight_terms: string | null;
  payment_terms: string | null;
  validity_date: Date | string | null;
  lead_time_days: number | null;
  notes: string | null;
  status: string;
  created_at: Date | string;
}

const RFQ_COLS =
  'id, tenant_id, company_id, reference, title, pr_id, pr_title, status, due_date, owner_id, created_by, created_at, sent_by, sent_at';
const QUOTE_COLS = 'id, rfq_id, tenant_id, company_id, supplier_name, supplier_id, amount, currency, tax_treatment, tax_rate_pct, freight_amount, freight_terms, payment_terms, validity_date, lead_time_days, notes, status, created_at';

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowToRfq(r: RfqRow): Rfq {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    reference: r.reference,
    title: r.title,
    prId: r.pr_id,
    prTitle: r.pr_title,
    status: r.status as Rfq['status'],
    dueDate: r.due_date,
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
    sentBy: r.sent_by ?? null,
    sentAt: r.sent_at ? iso(r.sent_at) : null,
  };
}

function rowToQuote(r: QuoteRow): RfqQuote {
  return {
    id: r.id,
    rfqId: r.rfq_id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    supplierName: r.supplier_name,
    supplierId: r.supplier_id,
    amount: Number(r.amount),
    currency: r.currency,
    taxTreatment: r.tax_treatment as RfqQuote['taxTreatment'],
    taxRatePct: r.tax_rate_pct === null ? null : Number(r.tax_rate_pct),
    freightAmount: r.freight_amount === null ? null : Number(r.freight_amount),
    freightTerms: r.freight_terms,
    paymentTerms: r.payment_terms,
    validityDate: r.validity_date === null ? null : String(r.validity_date instanceof Date ? r.validity_date.toISOString().slice(0,10) : r.validity_date).slice(0,10),
    leadTimeDays: r.lead_time_days,
    notes: r.notes,
    status: r.status as RfqQuote['status'],
    createdAt: iso(r.created_at),
  };
}

/** Durable RFQs + quotes on Postgres (`aura_procurement_rfqs`, `aura_procurement_rfq_quotes`). */
export class PostgresRfqStore implements RfqStore {
  constructor(private readonly pool: Pool) {}

  async create(r: Rfq): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_procurement_rfqs (${RFQ_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [r.id, r.tenantId, r.companyId, r.reference, r.title, r.prId, r.prTitle, r.status, r.dueDate, r.ownerId, r.createdBy, r.createdAt,
       r.sentBy, r.sentAt],
    );
  }

  async update(r: Rfq): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_procurement_rfqs SET reference=$2, title=$3, pr_id=$4, pr_title=$5, status=$6, due_date=$7, owner_id=$8, sent_by=$9, sent_at=$10 WHERE id=$1`,
      // `created_by` is absent on purpose, as it always has been: who raised the RFQ is fixed when it
      // is raised.
      [r.id, r.reference, r.title, r.prId, r.prTitle, r.status, r.dueDate, r.ownerId, r.sentBy, r.sentAt],
    );
  }

  async get(id: Id): Promise<Rfq | null> {
    const res = await this.pool.query<RfqRow>(`SELECT ${RFQ_COLS} FROM public.aura_procurement_rfqs WHERE id = $1`, [id]);
    return res.rows.length ? rowToRfq(res.rows[0]) : null;
  }

  private buildWhere(filter: RfqFilter): { whereSql: string; params: unknown[] } {
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
    add('pr_id', filter.prId);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: RfqFilter = {}): Promise<Rfq[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<RfqRow>(
      `SELECT ${RFQ_COLS} FROM public.aura_procurement_rfqs ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToRfq);
  }

  /** Uncapped by design — see the contract. */
  async listByPrIds(tenantId: Id, prIds: readonly string[]): Promise<Rfq[]> {
    if (prIds.length === 0) return [];
    const res = await this.pool.query<RfqRow>(
      `SELECT ${RFQ_COLS} FROM public.aura_procurement_rfqs
        WHERE tenant_id = $1 AND pr_id = ANY($2)
        ORDER BY created_at ASC`,
      [tenantId, [...prIds]],
    );
    return res.rows.map(rowToRfq);
  }

  async listPaged(filter: RfqFilter, page: PageParams): Promise<Page<Rfq>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_procurement_rfqs ${whereSql}`,
      params,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<RfqRow>(
      `SELECT ${RFQ_COLS} FROM public.aura_procurement_rfqs ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToRfq), total, page);
  }

  async addQuote(q: RfqQuote): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_procurement_rfq_quotes (${QUOTE_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [q.id, q.rfqId, q.tenantId, q.companyId, q.supplierName, q.supplierId, q.amount, q.currency,
       q.taxTreatment, q.taxRatePct, q.freightAmount, q.freightTerms, q.paymentTerms, q.validityDate,
       q.leadTimeDays, q.notes, q.status, q.createdAt],
    );
  }

  async updateQuote(q: RfqQuote): Promise<void> {
    await this.pool.query(`UPDATE public.aura_procurement_rfq_quotes SET status=$2 WHERE id=$1`, [q.id, q.status]);
  }

  async getQuote(id: Id): Promise<RfqQuote | null> {
    const res = await this.pool.query<QuoteRow>(`SELECT ${QUOTE_COLS} FROM public.aura_procurement_rfq_quotes WHERE id = $1`, [id]);
    return res.rows.length ? rowToQuote(res.rows[0]) : null;
  }

  async listQuotes(rfqId: Id): Promise<RfqQuote[]> {
    const res = await this.pool.query<QuoteRow>(
      `SELECT ${QUOTE_COLS} FROM public.aura_procurement_rfq_quotes WHERE rfq_id = $1 ORDER BY amount ASC`,
      [rfqId],
    );
    return res.rows.map(rowToQuote);
  }
}
