import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Tender } from './domain/tender';
import type { TenderFilter, TenderStore } from './tender-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  title: string;
  reference: string | null;
  account_id: string | null;
  account_name: string | null;
  status: string;
  source: string | null;
  submission_deadline: string | Date | null;
  source_opportunity_id: string | null;
  value: string | number;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, title, reference, account_id, account_name, status, source, value, submission_deadline, source_opportunity_id, owner_id, created_by, created_at';

function rowToTender(r: Row): Tender {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    title: r.title,
    reference: r.reference,
    accountId: r.account_id,
    accountName: r.account_name,
    status: r.status as Tender['status'],
    source: r.source as Tender['source'],
    value: Number(r.value),
    // pg returns `date` columns as a JS Date at LOCAL midnight — String() would yield
    // "Tue Sep 15" (which then corrupts every later UPDATE), and toISOString() can shift
    // a calendar day across timezones. Local getters give the stored calendar date.
    submissionDeadline: r.submission_deadline
      ? (r.submission_deadline instanceof Date
        ? `${r.submission_deadline.getFullYear()}-${String(r.submission_deadline.getMonth() + 1).padStart(2, '0')}-${String(r.submission_deadline.getDate()).padStart(2, '0')}`
        : String(r.submission_deadline).slice(0, 10))
      : null,
    sourceOpportunityId: r.source_opportunity_id,
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable tenders on Postgres (`aura_tendering_tenders`). */
export class PostgresTenderStore implements TenderStore {
  constructor(private readonly pool: Pool) {}

  async create(t: Tender): Promise<void> {
    await this.insert(this.pool, t);
  }

  async createWithClient(tx: TxHandle | null, t: Tender): Promise<void> {
    if (tx === null) return this.create(t);
    await this.insert(tx as PoolClient, t);
  }

  private insert(executor: Pool | PoolClient, t: Tender): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_tendering_tenders (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [t.id, t.tenantId, t.companyId, t.title, t.reference, t.accountId, t.accountName, t.status, t.source, t.value, t.submissionDeadline, t.sourceOpportunityId, t.ownerId, t.createdBy, t.createdAt],
    );
  }

  async update(t: Tender): Promise<void> {
    await this.upd(this.pool, t);
  }

  async updateWithClient(tx: TxHandle | null, t: Tender): Promise<void> {
    if (tx === null) return this.update(t);
    await this.upd(tx as PoolClient, t);
  }

  private upd(executor: Pool | PoolClient, t: Tender): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_tendering_tenders SET title=$2, reference=$3, account_id=$4, account_name=$5, status=$6, source=$7, value=$8, owner_id=$9, submission_deadline=$10 WHERE id=$1`,
      [t.id, t.title, t.reference, t.accountId, t.accountName, t.status, t.source, t.value, t.ownerId, t.submissionDeadline],
    );
  }

  async get(id: Id): Promise<Tender | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_tenders WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToTender(res.rows[0]) : null;
  }

  async list(filter: TenderFilter = {}): Promise<Tender[]> {
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
    add('source', filter.source);
    add('account_id', filter.accountId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_tenders ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToTender);
  }

  async listPaged(filter: TenderFilter, page: PageParams): Promise<Page<Tender>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('source', filter.source);
    add('account_id', filter.accountId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_tendering_tenders ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_tendering_tenders ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToTender), total, page);
  }
}
