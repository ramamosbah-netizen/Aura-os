import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams, EstimationLineInput } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Quotation, QuotationLine } from './domain/quotation';
import type { QuotationPricingInput } from './domain/quotation-pricing';
import type { QuotationFilter, QuotationStore, QuotationSummary } from './quotation-store';

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
    await this.upsert(this.pool, q);
  }

  /** Save on a caller-supplied transaction client (Slice 8 PR-2); `null` degrades to a pooled save. */
  async saveWithClient(tx: TxHandle | null, q: Quotation): Promise<void> {
    await this.upsert((tx as PoolClient | null) ?? this.pool, q);
  }

  private async upsert(executor: Pool | PoolClient, q: Quotation): Promise<void> {
    await executor.query(
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

  async getForTenant(tenantId: string, id: Id): Promise<Quotation | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_crm_quotations WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async getForTenantForUpdate(tx: TxHandle, tenantId: string, id: Id): Promise<Quotation | null> {
    const res = await (tx as PoolClient).query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_quotations WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, id],
    );
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
    add('owner_id', filter.ownerId);
    add('source_tender_id', filter.sourceTenderId);
    add('source_opportunity_id', filter.sourceOpportunityId);
    add('quote_number', filter.quoteNumber);
    if (filter.search?.trim()) {
      params.push(`%${filter.search.trim()}%`);
      const p = `$${params.length}`;
      where.push(`(quote_number ILIKE ${p} OR customer_name ILIKE ${p} OR COALESCE(subject, '') ILIKE ${p} OR COALESCE(contact_name, '') ILIKE ${p})`);
    }
    if (filter.issueDateFrom) {
      params.push(filter.issueDateFrom);
      where.push(`issue_date >= $${params.length}`);
    }
    if (filter.issueDateTo) {
      params.push(filter.issueDateTo);
      where.push(`issue_date <= $${params.length}`);
    }
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

  async streamAll(filter: QuotationFilter, onBatch: (rows: Quotation[]) => Promise<void>): Promise<void> {
    const base = this.buildWhere(filter);
    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;
    for (;;) {
      const params = [...base.params];
      let whereSql = base.whereSql;
      if (cursorCreatedAt !== null && cursorId !== null) {
        const join = whereSql ? ' AND ' : 'WHERE ';
        params.push(cursorCreatedAt, cursorId);
        whereSql += `${join}(created_at < $${params.length - 1} OR (created_at = $${params.length - 1} AND id < $${params.length}))`;
      }
      params.push(500);
      const res = await this.pool.query<Row>(
        `SELECT ${COLS} FROM public.aura_crm_quotations ${whereSql} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
        params,
      );
      if (res.rows.length === 0) return;
      await onBatch(res.rows.map(rowTo));
      const last = res.rows[res.rows.length - 1];
      cursorCreatedAt = last.created_at instanceof Date ? last.created_at.toISOString() : String(last.created_at);
      cursorId = last.id;
      if (res.rows.length < 500) return;
    }
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

  async summary(filter: QuotationFilter): Promise<QuotationSummary> {
    const { whereSql, params } = this.buildWhere(filter);
    const res = await this.pool.query<{
      total: string; total_value: string; draft_value: string; open_value: string; accepted_value: string; lost_value: string;
      accepted_count: string; decided_count: string; expiring_soon: string; pending_approval: string;
      opportunity_count: string; tender_count: string; direct_count: string;
      draft_count: string; review_count: string; approved_count: string; sent_count: string; negotiation_count: string; lost_count: string;
      draft_stage_value: string; review_stage_value: string; approved_stage_value: string; sent_stage_value: string; negotiation_stage_value: string; accepted_stage_value: string; lost_stage_value: string;
    }>(
      `SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(total), 0)::numeric AS total_value,
        COALESCE(SUM(total) FILTER (WHERE status IN ('draft','internal_review','approved')), 0)::numeric AS draft_value,
        COALESCE(SUM(total) FILTER (WHERE status IN ('sent','under_negotiation','negotiation')), 0)::numeric AS open_value,
        COALESCE(SUM(total) FILTER (WHERE status = 'accepted'), 0)::numeric AS accepted_value,
        COALESCE(SUM(total) FILTER (WHERE status IN ('rejected','expired','cancelled')), 0)::numeric AS lost_value,
        COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted_count,
        COUNT(*) FILTER (WHERE status IN ('accepted','rejected','expired','cancelled'))::int AS decided_count,
        COUNT(*) FILTER (WHERE status IN ('draft','internal_review','approved','sent','under_negotiation','negotiation') AND valid_until >= CURRENT_DATE AND valid_until <= CURRENT_DATE + INTERVAL '7 days')::int AS expiring_soon,
        COUNT(*) FILTER (WHERE status = 'internal_review')::int AS pending_approval,
        COUNT(*) FILTER (WHERE source_opportunity_id IS NOT NULL)::int AS opportunity_count,
        COUNT(*) FILTER (WHERE source_tender_id IS NOT NULL AND source_opportunity_id IS NULL)::int AS tender_count,
        COUNT(*) FILTER (WHERE source_opportunity_id IS NULL AND source_tender_id IS NULL)::int AS direct_count,
        COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_count,
        COUNT(*) FILTER (WHERE status = 'internal_review')::int AS review_count,
        COUNT(*) FILTER (WHERE status = 'approved')::int AS approved_count,
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent_count,
        COUNT(*) FILTER (WHERE status IN ('under_negotiation','negotiation'))::int AS negotiation_count,
        COUNT(*) FILTER (WHERE status IN ('rejected','expired','cancelled'))::int AS lost_count,
        COALESCE(SUM(total) FILTER (WHERE status = 'draft'), 0)::numeric AS draft_stage_value,
        COALESCE(SUM(total) FILTER (WHERE status = 'internal_review'), 0)::numeric AS review_stage_value,
        COALESCE(SUM(total) FILTER (WHERE status = 'approved'), 0)::numeric AS approved_stage_value,
        COALESCE(SUM(total) FILTER (WHERE status = 'sent'), 0)::numeric AS sent_stage_value,
        COALESCE(SUM(total) FILTER (WHERE status IN ('under_negotiation','negotiation')), 0)::numeric AS negotiation_stage_value,
        COALESCE(SUM(total) FILTER (WHERE status = 'accepted'), 0)::numeric AS accepted_stage_value,
        COALESCE(SUM(total) FILTER (WHERE status IN ('rejected','expired','cancelled')), 0)::numeric AS lost_stage_value
       FROM public.aura_crm_quotations ${whereSql}`,
      params,
    );
    const r = res.rows[0];
    const n = (v: string | undefined): number => Number(v ?? 0);
    return {
      total: n(r?.total), totalValue: n(r?.total_value), draftValue: n(r?.draft_value), openValue: n(r?.open_value),
      acceptedValue: n(r?.accepted_value), lostValue: n(r?.lost_value), acceptedCount: n(r?.accepted_count), decidedCount: n(r?.decided_count),
      expiringSoon: n(r?.expiring_soon), pendingApproval: n(r?.pending_approval),
      stage: {
        draft: { count: n(r?.draft_count), value: n(r?.draft_stage_value) }, review: { count: n(r?.review_count), value: n(r?.review_stage_value) },
        approved: { count: n(r?.approved_count), value: n(r?.approved_stage_value) }, sent: { count: n(r?.sent_count), value: n(r?.sent_stage_value) },
        negotiation: { count: n(r?.negotiation_count), value: n(r?.negotiation_stage_value) }, accepted: { count: n(r?.accepted_count), value: n(r?.accepted_stage_value) },
        lost: { count: n(r?.lost_count), value: n(r?.lost_stage_value) },
      },
      sources: { opportunity: n(r?.opportunity_count), tender: n(r?.tender_count), direct: n(r?.direct_count) },
    };
  }
}
