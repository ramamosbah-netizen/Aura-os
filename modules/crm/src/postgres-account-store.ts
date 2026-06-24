import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { Account } from './domain/account';
import type { AccountFilter, AccountStore } from './account-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  name: string;
  status: string;
  industry: string | null;
  website: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, name, status, industry, website, owner_id, created_by, created_at';

function rowToAccount(r: Row): Account {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    name: r.name,
    status: r.status as Account['status'],
    industry: r.industry,
    website: r.website,
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable CRM accounts on Postgres (`aura_crm_accounts`). */
export class PostgresAccountStore implements AccountStore {
  constructor(private readonly pool: Pool) {}

  async create(a: Account): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_accounts (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [a.id, a.tenantId, a.companyId, a.name, a.status, a.industry, a.website, a.ownerId, a.createdBy, a.createdAt],
    );
  }

  async get(id: Id): Promise<Account | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_accounts WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToAccount(res.rows[0]) : null;
  }

  async list(filter: AccountFilter = {}): Promise<Account[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.tenantId) {
      params.push(filter.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_accounts ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToAccount);
  }
}
