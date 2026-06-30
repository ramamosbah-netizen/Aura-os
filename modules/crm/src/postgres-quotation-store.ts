import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { Quotation, QuotationLine } from './domain/quotation';
import type { QuotationFilter, QuotationStore } from './quotation-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  quote_number: string;
  customer_name: string;
  account_id: string | null;
  contact_name: string | null;
  issue_date: string;
  valid_until: string | null;
  lines: QuotationLine[] | string;
  subtotal: string | number;
  vat_total: string | number;
  total: string | number;
  status: string;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, quote_number, customer_name, account_id, contact_name, ' +
  'issue_date::text AS issue_date, valid_until::text AS valid_until, lines, subtotal, vat_total, total, status, created_by, created_at';
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
    contactName: r.contact_name,
    issueDate: String(r.issue_date),
    validUntil: r.valid_until ? String(r.valid_until) : null,
    lines,
    subtotal: Number(r.subtotal),
    vatTotal: Number(r.vat_total),
    total: Number(r.total),
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
        (id, tenant_id, company_id, quote_number, customer_name, account_id, contact_name, issue_date, valid_until, lines, subtotal, vat_total, total, status, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
      [
        q.id, q.tenantId, q.companyId, q.quoteNumber, q.customerName, q.accountId, q.contactName, q.issueDate, q.validUntil,
        JSON.stringify(q.lines), q.subtotal, q.vatTotal, q.total, q.status, q.createdBy, q.createdAt,
      ],
    );
  }

  async get(id: Id): Promise<Quotation | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_crm_quotations WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async list(filter: QuotationFilter = {}): Promise<Quotation[]> {
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
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_quotations ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowTo);
  }
}
