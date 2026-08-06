import type { Pool } from 'pg';
import { type Id, type Page, type PageParams, makePage } from '@aura/shared';
import type { CreditNote } from './domain/credit-note';
import type { CustomerInvoiceLine } from './domain/customer-invoice';
import type { CreditNoteFilter, CreditNoteStore } from './credit-note-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  credit_note_number: string;
  customer_invoice_id: string;
  invoice_number: string | null;
  customer_name: string;
  reason: string | null;
  issue_date: string;
  lines: CustomerInvoiceLine[] | string;
  subtotal: string | number;
  vat_total: string | number;
  total: string | number;
  currency: string | null;
  exchange_rate: string | number | null;
  base_total: string | number | null;
  status: string;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, credit_note_number, customer_invoice_id, invoice_number, customer_name, reason, ' +
  'issue_date::text AS issue_date, lines, subtotal, vat_total, total, currency, exchange_rate, base_total, status, created_by, created_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowTo(r: Row): CreditNote {
  const lines = typeof r.lines === 'string' ? (JSON.parse(r.lines) as CustomerInvoiceLine[]) : r.lines;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    creditNoteNumber: r.credit_note_number,
    customerInvoiceId: r.customer_invoice_id,
    invoiceNumber: r.invoice_number,
    customerName: r.customer_name,
    reason: r.reason ?? '',
    issueDate: String(r.issue_date),
    lines,
    subtotal: Number(r.subtotal),
    vatTotal: Number(r.vat_total),
    total: Number(r.total),
    currency: r.currency ?? 'AED',
    exchangeRate: r.exchange_rate == null ? 1 : Number(r.exchange_rate),
    baseTotal: r.base_total == null ? Number(r.total) : Number(r.base_total),
    status: r.status as CreditNote['status'],
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

export class PostgresCreditNoteStore implements CreditNoteStore {
  constructor(private readonly pool: Pool) {}

  async save(n: CreditNote): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_credit_notes
        (id, tenant_id, company_id, credit_note_number, customer_invoice_id, invoice_number, customer_name, reason,
         issue_date, lines, subtotal, vat_total, total, currency, exchange_rate, base_total, status, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
      [
        n.id, n.tenantId, n.companyId, n.creditNoteNumber, n.customerInvoiceId, n.invoiceNumber, n.customerName, n.reason,
        n.issueDate, JSON.stringify(n.lines), n.subtotal, n.vatTotal, n.total, n.currency, n.exchangeRate, n.baseTotal, n.status, n.createdBy, n.createdAt,
      ],
    );
  }

  async get(id: Id): Promise<CreditNote | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_finance_credit_notes WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async list(filter: CreditNoteFilter = {}): Promise<CreditNote[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('customer_invoice_id', filter.customerInvoiceId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_credit_notes ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowTo);
  }

  async listPaged(filter: CreditNoteFilter, page: PageParams): Promise<Page<CreditNote>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('customer_invoice_id', filter.customerInvoiceId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(page.limit);
    params.push(page.offset);
    const res = await this.pool.query<Row & { total_count: string }>(
      `SELECT ${COLS}, COUNT(*) OVER() AS total_count
       FROM public.aura_finance_credit_notes ${whereSql}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = res.rows.length ? Number(res.rows[0].total_count) : 0;
    return makePage(res.rows.map(rowTo), total, page);
  }

  async existsByNumber(tenantId: Id, creditNoteNumber: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM public.aura_finance_credit_notes WHERE tenant_id = $1 AND credit_note_number = $2 LIMIT 1`,
      [tenantId, creditNoteNumber],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
