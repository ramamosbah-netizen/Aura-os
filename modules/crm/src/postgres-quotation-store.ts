import type { Pool } from 'pg';
import type { Id, Page, PageParams, EstimationLineInput } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { Quotation, QuotationLine } from './domain/quotation';
import type { QuotationPricingInput } from './domain/quotation-pricing';
import type { QuotationFilter, QuotationStore } from './quotation-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  quote_number: string;
  customer_name: string;
  account_id: string | null;
  subject: string | null;
  contact_name: string | null;
  source_tender_id: string | null;
  source_opportunity_id: string | null;
  owner_id: string | null;
  terms: string | null;
  exclusions: string[] | string | null;
  payment_conditions: string | null;
  delivery_terms: string | null;
  revision: number | string | null;
  parent_quotation_id: string | null;
  converted_contract_id: string | null;
  issue_date: string;
  valid_until: string | null;
  lines: QuotationLine[] | string;
  subtotal: string | number;
  vat_total: string | number;
  total: string | number;
  pricing: QuotationPricingInput | string | null;
  estimation: unknown[] | string | null;
  status: string;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, quote_number, customer_name, account_id, subject, contact_name, source_tender_id, source_opportunity_id, owner_id, terms, exclusions, payment_conditions, delivery_terms, revision, parent_quotation_id, converted_contract_id, ' +
  'issue_date::text AS issue_date, valid_until::text AS valid_until, lines, subtotal, vat_total, total, pricing, estimation, status, created_by, created_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowTo(r: Row): Quotation {
  const lines = typeof r.lines === 'string' ? (JSON.parse(r.lines) as QuotationLine[]) : r.lines;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    quoteNumber: r.quote_number,
    customerName: r.customer_name,
    accountId: r.account_id,
    subject: r.subject,
    contactName: r.contact_name,
    sourceTenderId: r.source_tender_id,
    sourceOpportunityId: r.source_opportunity_id,
    ownerId: r.owner_id,
    terms: r.terms,
    exclusions: typeof r.exclusions === 'string' ? (JSON.parse(r.exclusions) as string[]) : (r.exclusions ?? []),
    paymentConditions: r.payment_conditions,
    deliveryTerms: r.delivery_terms,
    revision: Number(r.revision ?? 0),
    parentQuotationId: r.parent_quotation_id,
    convertedContractId: r.converted_contract_id,
    issueDate: String(r.issue_date),
    validUntil: r.valid_until ? String(r.valid_until) : null,
    lines,
    subtotal: Number(r.subtotal),
    vatTotal: Number(r.vat_total),
    total: Number(r.total),
    pricing: typeof r.pricing === 'string' ? (JSON.parse(r.pricing) as QuotationPricingInput) : (r.pricing ?? null),
    estimation: r.estimation == null ? null
      : (typeof r.estimation === 'string' ? (JSON.parse(r.estimation) as EstimationLineInput[]) : (r.estimation as EstimationLineInput[])),
    status: r.status as Quotation['status'],
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

export class PostgresQuotationStore implements QuotationStore {
  constructor(private readonly pool: Pool) {}

  async save(q: Quotation): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_quotations
        (id, tenant_id, company_id, quote_number, customer_name, account_id, contact_name, source_tender_id, source_opportunity_id, owner_id, terms, exclusions, payment_conditions, delivery_terms, revision, parent_quotation_id, converted_contract_id, issue_date, valid_until, lines, subtotal, vat_total, total, pricing, status, created_by, created_at, subject, estimation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, terms = EXCLUDED.terms, owner_id = EXCLUDED.owner_id, subject = EXCLUDED.subject, estimation = EXCLUDED.estimation,
         exclusions = EXCLUDED.exclusions, payment_conditions = EXCLUDED.payment_conditions, delivery_terms = EXCLUDED.delivery_terms,
         converted_contract_id = EXCLUDED.converted_contract_id, valid_until = EXCLUDED.valid_until,
         pricing = EXCLUDED.pricing,
         -- Line/total fields must persist too: authoring the quote from its pricing sheet
         -- (applyPricing) rewrites lines + totals on an existing row. Omitting these silently
         -- dropped the new prices.
         lines = EXCLUDED.lines, subtotal = EXCLUDED.subtotal, vat_total = EXCLUDED.vat_total, total = EXCLUDED.total`,
      [
        q.id, q.tenantId, q.companyId, q.quoteNumber, q.customerName, q.accountId, q.contactName, q.sourceTenderId, q.sourceOpportunityId, q.ownerId, q.terms, JSON.stringify(q.exclusions ?? []), q.paymentConditions, q.deliveryTerms, q.revision, q.parentQuotationId, q.convertedContractId, q.issueDate, q.validUntil,
        JSON.stringify(q.lines), q.subtotal, q.vatTotal, q.total, q.pricing ? JSON.stringify(q.pricing) : null, q.status, q.createdBy, q.createdAt, q.subject,
        q.estimation ? JSON.stringify(q.estimation) : null,
      ],
    );
  }

  async get(id: Id): Promise<Quotation | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_crm_quotations WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  private buildWhere(filter: QuotationFilter): { whereSql: string; params: unknown[] } {
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
    add('account_id', filter.accountId);
    add('source_tender_id', filter.sourceTenderId);
    add('source_opportunity_id', filter.sourceOpportunityId);
    add('quote_number', filter.quoteNumber);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: QuotationFilter = {}): Promise<Quotation[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_quotations ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowTo);
  }
  async listPaged(filter: QuotationFilter, page: PageParams): Promise<Page<Quotation>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_crm_quotations ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_quotations ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowTo), total, page);
  }
}
