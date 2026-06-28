import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { BankTransaction } from './domain/bank-transaction';
import type { BankTransactionFilter, BankTransactionStore } from './bank-transaction-store';

interface BankTxRow {
  id: string;
  tenant_id: string;
  bank_account_id: string;
  transaction_date: Date | string;
  amount: string | number;
  description: string;
  reference: string | null;
  reconciled_payment_id: string | null;
  status: string;
  created_at: Date | string;
}

const COLS = 'id, tenant_id, bank_account_id, transaction_date, amount, description, reference, reconciled_payment_id, status, created_at';

function rowToTx(r: BankTxRow): BankTransaction {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    bankAccountId: r.bank_account_id,
    transactionDate: r.transaction_date instanceof Date ? r.transaction_date.toISOString() : String(r.transaction_date),
    amount: Number(r.amount),
    description: r.description,
    reference: r.reference,
    reconciledPaymentId: r.reconciled_payment_id,
    status: r.status as BankTransaction['status'],
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export class PostgresBankTransactionStore implements BankTransactionStore {
  constructor(private readonly pool: Pool) {}

  async create(tx: BankTransaction): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_bank_transactions (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        tx.id,
        tx.tenantId,
        tx.bankAccountId,
        tx.transactionDate,
        tx.amount,
        tx.description,
        tx.reference,
        tx.reconciledPaymentId,
        tx.status,
        tx.createdAt,
      ],
    );
  }

  async update(tx: BankTransaction): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_finance_bank_transactions SET status=$2, reconciled_payment_id=$3 WHERE id=$1`,
      [tx.id, tx.status, tx.reconciledPaymentId],
    );
  }

  async get(id: Id): Promise<BankTransaction | null> {
    const res = await this.pool.query<BankTxRow>(
      `SELECT ${COLS} FROM public.aura_finance_bank_transactions WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToTx(res.rows[0]) : null;
  }

  async list(filter: BankTransactionFilter = {}): Promise<BankTransaction[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };

    add('tenant_id', filter.tenantId);
    add('bank_account_id', filter.bankAccountId);
    add('status', filter.status);

    let whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    let limitSql = '';
    if (filter.limit) {
      params.push(filter.limit);
      limitSql = `LIMIT $${params.length}`;
    }

    const res = await this.pool.query<BankTxRow>(
      `SELECT ${COLS} FROM public.aura_finance_bank_transactions ${whereSql} ORDER BY transaction_date DESC ${limitSql}`,
      params,
    );
    return res.rows.map(rowToTx);
  }
}
