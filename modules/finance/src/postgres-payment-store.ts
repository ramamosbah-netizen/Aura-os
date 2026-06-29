import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { Payment } from './domain/payment';
import type { PaymentFilter, PaymentStore } from './payment-store';

interface Row {
  id: string;
  tenant_id: string;
  invoice_id: string;
  bank_account_id: string;
  amount: string | number;
  reference: string | null;
  created_by: string | null;
  paid_at: Date | string;
}

const COLS = 'id, tenant_id, invoice_id, bank_account_id, amount, reference, created_by, paid_at';

function rowToPayment(r: Row): Payment {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    invoiceId: r.invoice_id,
    bankAccountId: r.bank_account_id,
    amount: Number(r.amount),
    reference: r.reference,
    createdBy: r.created_by,
    paidAt: r.paid_at instanceof Date ? r.paid_at.toISOString() : String(r.paid_at),
  };
}

export class PostgresPaymentStore implements PaymentStore {
  constructor(private readonly pool: Pool) {}

  async create(p: Payment): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_payments (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [p.id, p.tenantId, p.invoiceId, p.bankAccountId, p.amount, p.reference, p.createdBy, p.paidAt],
    );
  }

  async get(id: Id): Promise<Payment | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_payments WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToPayment(res.rows[0]) : null;
  }

  async list(filter: PaymentFilter = {}): Promise<Payment[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('invoice_id', filter.invoiceId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_payments ${whereSql} ORDER BY paid_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToPayment);
  }
}
