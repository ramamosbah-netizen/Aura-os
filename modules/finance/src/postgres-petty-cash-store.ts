import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { PettyCashFund, PettyCashTransaction } from './domain/petty-cash';
import type { PettyCashFilter, PettyCashStore } from './petty-cash-store';

interface FundRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  name: string;
  custodian_employee_id: string | null;
  balance: string | number;
  status: string;
  created_by: string | null;
  created_at: Date | string;
}

interface TxRow {
  id: string;
  tenant_id: string;
  fund_id: string;
  type: string;
  category: string;
  amount: string | number;
  description: string;
  balance_after: string | number;
  transaction_date: string;
  created_at: Date | string;
}

const FUND_COLS = 'id, tenant_id, company_id, name, custodian_employee_id, balance, status, created_by, created_at';
const TX_COLS = 'id, tenant_id, fund_id, type, category, amount, description, balance_after, transaction_date::text AS transaction_date, created_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowToFund(r: FundRow): PettyCashFund {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    name: r.name,
    custodianEmployeeId: r.custodian_employee_id,
    balance: Number(r.balance),
    status: r.status as PettyCashFund['status'],
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

function rowToTx(r: TxRow): PettyCashTransaction {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    fundId: r.fund_id,
    type: r.type as PettyCashTransaction['type'],
    category: r.category as PettyCashTransaction['category'],
    amount: Number(r.amount),
    description: r.description,
    balanceAfter: Number(r.balance_after),
    transactionDate: String(r.transaction_date),
    createdAt: iso(r.created_at),
  };
}

/** Durable petty cash on Postgres (`aura_finance_petty_cash_funds` + `_transactions`). */
export class PostgresPettyCashStore implements PettyCashStore {
  constructor(private readonly pool: Pool) {}

  async createFund(f: PettyCashFund): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_petty_cash_funds (${FUND_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [f.id, f.tenantId, f.companyId, f.name, f.custodianEmployeeId, f.balance, f.status, f.createdBy, f.createdAt],
    );
  }

  async updateFund(f: PettyCashFund): Promise<void> {
    await this.pool.query(`UPDATE public.aura_finance_petty_cash_funds SET balance=$2, status=$3, name=$4, custodian_employee_id=$5 WHERE id=$1`, [
      f.id,
      f.balance,
      f.status,
      f.name,
      f.custodianEmployeeId,
    ]);
  }

  async getFund(id: Id): Promise<PettyCashFund | null> {
    const res = await this.pool.query<FundRow>(`SELECT ${FUND_COLS} FROM public.aura_finance_petty_cash_funds WHERE id = $1`, [id]);
    return res.rows.length ? rowToFund(res.rows[0]) : null;
  }

  async listFunds(filter: PettyCashFilter = {}): Promise<PettyCashFund[]> {
    const params: unknown[] = [];
    let where = '';
    if (filter.tenantId) {
      params.push(filter.tenantId);
      where = `WHERE tenant_id = $${params.length}`;
    }
    params.push(filter.limit ?? 200);
    const res = await this.pool.query<FundRow>(
      `SELECT ${FUND_COLS} FROM public.aura_finance_petty_cash_funds ${where} ORDER BY name ASC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToFund);
  }

  async listFundsPaged(filter: PettyCashFilter, page: PageParams): Promise<Page<PettyCashFund>> {
    const params: unknown[] = [];
    let where = '';
    if (filter.tenantId) {
      params.push(filter.tenantId);
      where = `WHERE tenant_id = $${params.length}`;
    }
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_finance_petty_cash_funds ${where}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<FundRow>(
      `SELECT ${FUND_COLS} FROM public.aura_finance_petty_cash_funds ${where} ORDER BY name ASC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToFund), total, page);
  }

  async addTransaction(t: PettyCashTransaction): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_petty_cash_transactions
        (id, tenant_id, fund_id, type, category, amount, description, balance_after, transaction_date, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [t.id, t.tenantId, t.fundId, t.type, t.category, t.amount, t.description, t.balanceAfter, t.transactionDate, t.createdAt],
    );
  }

  async listTransactions(fundId: Id): Promise<PettyCashTransaction[]> {
    const res = await this.pool.query<TxRow>(
      `SELECT ${TX_COLS} FROM public.aura_finance_petty_cash_transactions WHERE fund_id = $1 ORDER BY created_at DESC`,
      [fundId],
    );
    return res.rows.map(rowToTx);
  }
}
