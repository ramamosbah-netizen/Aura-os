import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Project } from './domain/project';
import type { ProjectFilter, ProjectStore } from './project-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  title: string;
  reference: string | null;
  contract_id: string | null;
  contract_title: string | null;
  account_id: string | null;
  account_name: string | null;
  status: string;
  value: string | number;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, title, reference, contract_id, contract_title, account_id, account_name, status, value, owner_id, created_by, created_at';

function rowToProject(r: Row): Project {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    title: r.title,
    reference: r.reference,
    contractId: r.contract_id,
    contractTitle: r.contract_title,
    accountId: r.account_id,
    accountName: r.account_name,
    status: r.status as Project['status'],
    value: Number(r.value),
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable projects on Postgres (`aura_projects_projects`). */
export class PostgresProjectStore implements ProjectStore {
  constructor(private readonly pool: Pool) {}

  async create(p: Project): Promise<void> {
    await this.insert(this.pool, p);
  }

  async createWithClient(tx: TxHandle | null, p: Project): Promise<void> {
    if (tx === null) return this.create(p);
    await this.insert(tx as PoolClient, p);
  }

  private insert(executor: Pool | PoolClient, p: Project): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_projects_projects (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [p.id, p.tenantId, p.companyId, p.title, p.reference, p.contractId, p.contractTitle, p.accountId, p.accountName, p.status, p.value, p.ownerId, p.createdBy, p.createdAt],
    );
  }

  async get(id: Id): Promise<Project | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_projects WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToProject(res.rows[0]) : null;
  }

  async list(filter: ProjectFilter = {}): Promise<Project[]> {
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
    add('account_id', filter.accountId);
    add('contract_id', filter.contractId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_projects ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToProject);
  }

  async listPaged(filter: ProjectFilter, page: PageParams): Promise<Page<Project>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('status', filter.status);
    add('account_id', filter.accountId);
    add('contract_id', filter.contractId);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_projects_projects ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_projects ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToProject), total, page);
  }
}
