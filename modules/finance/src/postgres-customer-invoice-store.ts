import type { Pool } from 'pg';
import { type Id, type Page, type PageParams, makePage } from '@aura/shared';
import type { CustomerInvoice, CustomerInvoiceLine } from './domain/customer-invoice';
import type { CustomerReceipt } from './domain/customer-receipt';
import type { CustomerInvoiceFilter, CustomerInvoiceStore } from './customer-invoice-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  invoice_number: string;
  account_id: string | null;
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
  exchange_rate_effective_date: string | null;
  exchange_rate_source: string | null;
  exchange_rate_id: string | null;
  amount_paid: string | number;
  status: string;
  deleted_at: Date | string | null;
  created_by: string | null;
  issued_by: string | null;
  issued_at: Date | string | null;
  cancelled_by: string | null;
  cancelled_at: Date | string | null;
  cancel_reason: string | null;
  deleted_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, invoice_number, account_id, customer_name, project_id, project_name, contract_ref, ' +
  'issue_date::text AS issue_date, due_date::text AS due_date, lines, subtotal, vat_total, total, currency, exchange_rate, base_total, ' +
  'exchange_rate_effective_date::text AS exchange_rate_effective_date, exchange_rate_source, exchange_rate_id, amount_paid, status, deleted_at, created_by, created_at, ' +
  'issued_by, issued_at, cancelled_by, cancelled_at, cancel_reason, deleted_by';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowTo(r: Row): CustomerInvoice {
  const lines = typeof r.lines === 'string' ? (JSON.parse(r.lines) as CustomerInvoiceLine[]) : r.lines;
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    invoiceNumber: r.invoice_number,
    accountId: r.account_id,
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
    // NULL provenance is legacy evidence — booked before FX-01 and never backfilled (migration 0348).
    exchangeRateEffectiveDate: r.exchange_rate_effective_date ?? null,
    exchangeRateSource: r.exchange_rate_source ?? null,
    exchangeRateId: r.exchange_rate_id ?? null,
    amountPaid: Number(r.amount_paid),
    status: r.status as CustomerInvoice['status'],
    deletedAt: r.deleted_at ? iso(r.deleted_at) : null,
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
    issuedBy: r.issued_by ?? null,
    issuedAt: r.issued_at ? iso(r.issued_at) : null,
    cancelledBy: r.cancelled_by ?? null,
    cancelledAt: r.cancelled_at ? iso(r.cancelled_at) : null,
    cancelReason: r.cancel_reason ?? null,
    deletedBy: r.deleted_by ?? null,
  };
}

export class PostgresCustomerInvoiceStore implements CustomerInvoiceStore {
  constructor(private readonly pool: Pool) {}

  /**
   * `amount_paid` is deliberately ABSENT from this write (AR-INV-02). It is the sum of the invoice's
   * receipts, kept by the receipts trigger of migration 0400, which refuses any other writer setting
   * it — so a new row takes the column default of 0, and an update leaves it where the receipts put it.
   */
  async save(inv: CustomerInvoice): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_customer_invoices
        (id, tenant_id, company_id, invoice_number, account_id, customer_name, project_id, project_name, contract_ref,
         issue_date, due_date, lines, subtotal, vat_total, total, currency, exchange_rate, base_total,
         exchange_rate_effective_date, exchange_rate_source, exchange_rate_id, status, created_by, created_at,
         issued_by, issued_at, cancelled_by, cancelled_at, cancel_reason, deleted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         issued_by = EXCLUDED.issued_by, issued_at = EXCLUDED.issued_at,
         cancelled_by = EXCLUDED.cancelled_by, cancelled_at = EXCLUDED.cancelled_at,
         cancel_reason = EXCLUDED.cancel_reason, deleted_by = EXCLUDED.deleted_by`,
      [
        inv.id, inv.tenantId, inv.companyId, inv.invoiceNumber, inv.accountId, inv.customerName, inv.projectId, inv.projectName, inv.contractRef,
        inv.issueDate, inv.dueDate, JSON.stringify(inv.lines), inv.subtotal, inv.vatTotal, inv.total, inv.currency, inv.exchangeRate, inv.baseTotal,
        inv.exchangeRateEffectiveDate, inv.exchangeRateSource, inv.exchangeRateId, inv.status, inv.createdBy, inv.createdAt,
        // `created_by` and `created_at` stay out of the DO UPDATE SET above, as they always have:
        // who raised the invoice is fixed when it is raised. `issued_by` is in it, because the row is
        // written once at create and again at issue — and it is the fact the cancellation is refused
        // against, so the domain, not the store, is what stops it being restated.
        inv.issuedBy, inv.issuedAt, inv.cancelledBy, inv.cancelledAt, inv.cancelReason, inv.deletedBy,
      ],
    );
  }

  async get(id: Id): Promise<CustomerInvoice | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_finance_customer_invoices WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async list(filter: CustomerInvoiceFilter = {}): Promise<CustomerInvoice[]> {
    const where: string[] = ['deleted_at IS NULL'];
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
      `SELECT ${COLS} FROM public.aura_finance_customer_invoices ${whereSql} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowTo);
  }

  async listPaged(filter: CustomerInvoiceFilter, page: PageParams): Promise<Page<CustomerInvoice>> {
    const where: string[] = ['deleted_at IS NULL'];
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
       ORDER BY created_at DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = res.rows.length ? Number(res.rows[0].total_count) : 0;
    return makePage(res.rows.map(rowTo), total, page);
  }

  async setDeleted(tenantId: string, id: Id, deleted: boolean): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_finance_customer_invoices SET deleted_at = ${deleted ? 'now()' : 'NULL'} WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
  }

  async existsByNumber(tenantId: Id, invoiceNumber: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM public.aura_finance_customer_invoices
       WHERE tenant_id = $1 AND invoice_number = $2 AND deleted_at IS NULL LIMIT 1`,
      [tenantId, invoiceNumber],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * One INSERT. Everything else is the database's: the receipts trigger (migration 0400) locks the
   * invoice row, refuses a receipt on an invoice that is not open for one or that would take it past
   * its total, and sets `amount_paid` and the status from the sum of the receipts. Concurrent receipts
   * serialise on that lock, so two of them cannot both fit into the same balance.
   */
  async addReceipt(receipt: CustomerReceipt): Promise<CustomerInvoice> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_customer_receipts
        (id, tenant_id, invoice_id, amount, received_on, bank_reference, recorded_by, recorded_at, legacy)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false)`,
      [receipt.id, receipt.tenantId, receipt.invoiceId, receipt.amount, receipt.receivedOn, receipt.bankReference, receipt.recordedBy, receipt.recordedAt],
    );
    const inv = await this.get(receipt.invoiceId);
    if (!inv) throw new Error(`customer invoice ${receipt.invoiceId} not found`);
    return inv;
  }

  async listReceipts(tenantId: Id, invoiceId: Id): Promise<CustomerReceipt[]> {
    const res = await this.pool.query<{
      id: string; tenant_id: string; invoice_id: string; amount: string | number; received_on: string | null;
      bank_reference: string | null; recorded_by: string | null; recorded_at: Date | string | null; legacy: boolean;
    }>(
      `SELECT id, tenant_id, invoice_id, amount, received_on::text AS received_on, bank_reference, recorded_by, recorded_at, legacy
       FROM public.aura_finance_customer_receipts
       WHERE tenant_id = $1 AND invoice_id = $2
       ORDER BY legacy DESC, recorded_at ASC NULLS FIRST, id`,
      [tenantId, invoiceId],
    );
    return res.rows.map((r) => ({
      id: r.id, tenantId: r.tenant_id, invoiceId: r.invoice_id, amount: Number(r.amount),
      receivedOn: r.received_on, bankReference: r.bank_reference, recordedBy: r.recorded_by,
      recordedAt: r.recorded_at ? iso(r.recorded_at) : null, legacy: r.legacy,
    }));
  }
}
