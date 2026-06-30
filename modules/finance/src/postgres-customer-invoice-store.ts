import type { Pool } from 'pg';
import { type Id, type Page, type PageParams, makePage } from '@aura/shared';
import type { CustomerInvoice, CustomerInvoiceLine } from './domain/customer-invoice';
import type { CustomerInvoiceFilter, CustomerInvoiceStore } from './customer-invoice-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  invoice_number: string;
  customer_name: string;
  project_id: string | null;
  project_name: string | null;
  contract_ref: string | null;
  issue_date: string;
  due_date: string | null;
  lines: CustomerInvoiceLine[] | string;
  subtotal: string | number;
  vat_total: string | number;
  total: string | number;
  currency: string | null;
  exchange_rate: string | number | null;
  base_total: string | number | null;
  amount_paid: string | number;
  status: string;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, invoice_number, customer_name, project_id, project_name, contract_ref, ' +
  'issue_date::text AS issue_date, due_date::text AS due_date, lines, subtotal, vat_total, total, currency, exchange_rate, base_total, amount_paid, status, created_by, created_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowTo(r: Row): CustomerInvoice {
  const lines = typeof r.lines === 'string' ? (JSON.parse(r.lines) as CustomerInvoiceLine[]) : r.lines;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    invoiceNumber: r.invoice_number,
    customerName: r.customer_name,
    projectId: r.project_id,
    projectName: r.project_name,
    contractRef: r.contract_ref,
    issueDate: String(r.issue_date),
    dueDate: r.due_date ? String(r.due_date) : null,
    lines,
    subtotal: Number(r.subtotal),
    vatTotal: Number(r.vat_total),
    total: Number(r.total),
    currency: r.currency ?? 'AED',
    exchangeRate: r.exchange_rate == null ? 1 : Number(r.exchange_rate),
    baseTotal: r.base_total == null ? Number(r.total) : Number(r.base_total),
    amountPaid: Number(r.amount_paid),
    status: r.status as CustomerInvoice['status'],
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

export class PostgresCustomerInvoiceStore implements CustomerInvoiceStore {
  constructor(private readonly pool: Pool) {}

  async save(inv: CustomerInvoice): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_customer_invoices
        (id, tenant_id, company_id, invoice_number, customer_name, project_id, project_name, contract_ref,
         issue_date, due_date, lines, subtotal, vat_total, total, currency, exchange_rate, base_total, amount_paid, status, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (id) DO UPDATE SET
         amount_paid = EXCLUDED.amount_paid, status = EXCLUDED.status`,
      [
        inv.id, inv.tenantId, inv.companyId, inv.invoiceNumber, inv.customerName, inv.projectId, inv.projectName, inv.contractRef,
        inv.issueDate, inv.dueDate, JSON.stringify(inv.lines), inv.subtotal, inv.vatTotal, inv.total, inv.currency, inv.exchangeRate, inv.baseTotal, inv.amountPaid, inv.status, inv.createdBy, inv.createdAt,
      ],
    );
  }

  async get(id: Id): Promise<CustomerInvoice | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_finance_customer_invoices WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async list(filter: CustomerInvoiceFilter = {}): Promise<CustomerInvoice[]> {
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
    add('project_id', filter.projectId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_customer_invoices ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowTo);
  }

  async listPaged(filter: CustomerInvoiceFilter, page: PageParams): Promise<Page<CustomerInvoice>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('project_id', filter.projectId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(page.limit);
    params.push(page.offset);
    const res = await this.pool.query<Row & { total_count: string }>(
      `SELECT ${COLS}, COUNT(*) OVER() AS total_count
       FROM public.aura_finance_customer_invoices ${whereSql}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = res.rows.length ? Number(res.rows[0].total_count) : 0;
    return makePage(res.rows.map(rowTo), total, page);
  }
}
