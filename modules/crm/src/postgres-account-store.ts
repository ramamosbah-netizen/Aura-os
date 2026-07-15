import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Account } from './domain/account';
import type { AccountFilter, AccountStore } from './account-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  name: string;
  status: string;
  party_type: string | null;
  industry: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  billing_address: string | null;
  source: string | null;
  payment_terms: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, name, status, party_type, industry, website, phone, email, billing_address, source, payment_terms, owner_id, created_by, created_at';

function rowToAccount(r: Row): Account {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    name: r.name,
    status: r.status as Account['status'],
    partyType: r.party_type as Account['partyType'],
    industry: r.industry,
    website: r.website,
    phone: r.phone,
    email: r.email,
    billingAddress: r.billing_address,
    source: r.source,
    paymentTerms: r.payment_terms,
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable CRM accounts on Postgres (`aura_crm_accounts`). */
export class PostgresAccountStore implements AccountStore {
  constructor(private readonly pool: Pool) {}

  async create(a: Account): Promise<void> {
    await this.insert(this.pool, a);
  }

  async createWithClient(tx: TxHandle | null, a: Account): Promise<void> {
    if (tx === null) return this.create(a);
    await this.insert(tx as PoolClient, a);
  }

  private insert(executor: Pool | PoolClient, a: Account): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_crm_accounts (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [a.id, a.tenantId, a.companyId, a.name, a.status, a.partyType, a.industry, a.website, a.phone, a.email, a.billingAddress, a.source, a.paymentTerms, a.ownerId, a.createdBy, a.createdAt],
    );
  }

  async update(a: Account): Promise<void> {
    await this.upd(this.pool, a);
  }

  async updateWithClient(tx: TxHandle | null, a: Account): Promise<void> {
    if (tx === null) return this.update(a);
    await this.upd(tx as PoolClient, a);
  }

  private upd(executor: Pool | PoolClient, a: Account): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_crm_accounts SET name=$2, status=$3, industry=$4, website=$5, owner_id=$6, phone=$7, email=$8, billing_address=$9, source=$10, payment_terms=$11, party_type=$12 WHERE id=$1`,
      [a.id, a.name, a.status, a.industry, a.website, a.ownerId, a.phone, a.email, a.billingAddress, a.source, a.paymentTerms, a.partyType],
    );
  }

  async get(id: Id): Promise<Account | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_accounts WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToAccount(res.rows[0]) : null;
  }

  private buildWhere(filter: AccountFilter): { whereSql: string; params: unknown[] } {
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
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: AccountFilter = {}): Promise<Account[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_accounts ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToAccount);
  }
  async listPaged(filter: AccountFilter, page: PageParams): Promise<Page<Account>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_crm_accounts ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_accounts ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToAccount), total, page);
  }
}
