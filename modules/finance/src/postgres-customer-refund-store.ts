import type { Pool } from 'pg';
import { type Id, type Page, type PageParams, makePage } from '@aura/shared';
import type { CustomerRefund } from './domain/customer-refund';
import type { CustomerRefundFilter, CustomerRefundStore } from './customer-refund-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  refund_number: string;
  customer_name: string;
  reference: string | null;
  reason: string | null;
  amount: string | number;
  currency: string | null;
  refund_date: string;
  status: string;
  paid_at: Date | string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, refund_number, customer_name, reference, reason, amount, currency, ' +
  'refund_date::text AS refund_date, status, paid_at, created_by, created_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowTo(r: Row): CustomerRefund {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    refundNumber: r.refund_number,
    customerName: r.customer_name,
    reference: r.reference,
    reason: r.reason ?? '',
    amount: Number(r.amount),
    currency: r.currency ?? 'AED',
    refundDate: String(r.refund_date),
    status: r.status as CustomerRefund['status'],
    paidAt: r.paid_at ? iso(r.paid_at) : null,
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

export class PostgresCustomerRefundStore implements CustomerRefundStore {
  constructor(private readonly pool: Pool) {}

  async save(r: CustomerRefund): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_customer_refunds
        (id, tenant_id, company_id, refund_number, customer_name, reference, reason, amount, currency, refund_date, status, paid_at, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, paid_at = EXCLUDED.paid_at`,
      [r.id, r.tenantId, r.companyId, r.refundNumber, r.customerName, r.reference, r.reason, r.amount, r.currency, r.refundDate, r.status, r.paidAt, r.createdBy, r.createdAt],
    );
  }

  async get(id: Id): Promise<CustomerRefund | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_finance_customer_refunds WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async list(filter: CustomerRefundFilter = {}): Promise<CustomerRefund[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => { if (val) { params.push(val); where.push(`${col} = $${params.length}`); } };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_customer_refunds ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowTo);
  }

  async listPaged(filter: CustomerRefundFilter, page: PageParams): Promise<Page<CustomerRefund>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => { if (val) { params.push(val); where.push(`${col} = $${params.length}`); } };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(page.limit);
    params.push(page.offset);
    const res = await this.pool.query<Row & { total_count: string }>(
      `SELECT ${COLS}, COUNT(*) OVER() AS total_count FROM public.aura_finance_customer_refunds ${whereSql}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const total = res.rows.length ? Number(res.rows[0].total_count) : 0;
    return makePage(res.rows.map(rowTo), total, page);
  }

  async existsByNumber(tenantId: Id, refundNumber: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM public.aura_finance_customer_refunds WHERE tenant_id = $1 AND refund_number = $2 LIMIT 1`,
      [tenantId, refundNumber],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
