import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { Account } from './domain/account';
import type { AccountFilter, AccountStore } from './account-store';

interface Row {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  created_at: Date | string;
}

const COLS = 'id, tenant_id, code, name, type, parent_id, created_at';

function rowToAccount(r: Row): Account {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    code: r.code,
    name: r.name,
    type: r.type as Account['type'],
    parentId: r.parent_id,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export class PostgresAccountStore implements AccountStore {
  constructor(private readonly pool: Pool) {}

  async create(a: Account): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_finance_accounts (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [a.id, a.tenantId, a.code, a.name, a.type, a.parentId, a.createdAt],
    );
  }

  async get(id: Id): Promise<Account | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_accounts WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToAccount(res.rows[0]) : null;
  }

  async getByCode(tenantId: Id, code: string): Promise<Account | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_accounts WHERE tenant_id = $1 AND code = $2`,
      [tenantId, code],
    );
    return res.rows.length ? rowToAccount(res.rows[0]) : null;
  }

  async list(filter: AccountFilter = {}): Promise<Account[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('type', filter.type);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_finance_accounts ${whereSql} ORDER BY code ASC`,
      params,
    );
    return res.rows.map(rowToAccount);
  }
}
