import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Rfi } from './domain/rfi';
import type { RfiFilter, RfiStore } from './rfi-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  code: string;
  title: string;
  question: string;
  answer: string | null;
  status: string;
  discipline: string;
  project_id: string;
  project_name: string | null;
  assigned_to: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, code, title, question, answer, status, discipline, project_id, project_name, assigned_to, owner_id, created_by, created_at, updated_at';

function rowToRfi(r: Row): Rfi {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    code: r.code,
    title: r.title,
    question: r.question,
    answer: r.answer,
    status: r.status as Rfi['status'],
    discipline: r.discipline as Rfi['discipline'],
    projectId: r.project_id,
    projectName: r.project_name,
    assignedTo: r.assigned_to,
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export class PostgresRfiStore implements RfiStore {
  constructor(private readonly pool: Pool) {}

  async create(r: Rfi): Promise<void> {
    await this.insert(this.pool, r);
  }

  async createWithClient(tx: TxHandle | null, r: Rfi): Promise<void> {
    if (tx === null) return this.create(r);
    await this.insert(tx as PoolClient, r);
  }

  private insert(executor: Pool | PoolClient, r: Rfi): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_engineering_rfis (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        r.id, r.tenantId, r.companyId, r.code, r.title, r.question, r.answer, r.status, r.discipline,
        r.projectId, r.projectName, r.assignedTo, r.ownerId, r.createdBy, r.createdAt, r.updatedAt
      ],
    );
  }

  async update(r: Rfi): Promise<void> {
    await this.modify(this.pool, r);
  }

  async updateWithClient(tx: TxHandle | null, r: Rfi): Promise<void> {
    if (tx === null) return this.update(r);
    await this.modify(tx as PoolClient, r);
  }

  private modify(executor: Pool | PoolClient, r: Rfi): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_engineering_rfis
       SET title=$2, question=$3, answer=$4, status=$5, discipline=$6, assigned_to=$7, owner_id=$8, updated_at=now()
       WHERE id=$1`,
      [r.id, r.title, r.question, r.answer, r.status, r.discipline, r.assignedTo, r.ownerId],
    );
  }

  async get(id: Id): Promise<Rfi | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_rfis WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToRfi(res.rows[0]) : null;
  }

  async getByCode(tenantId: Id, projectId: Id, code: string): Promise<Rfi | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_rfis 
       WHERE tenant_id = $1 AND project_id = $2 AND code = $3`,
      [tenantId, projectId, code],
    );
    return res.rows.length ? rowToRfi(res.rows[0]) : null;
  }

  async list(filter: RfiFilter = {}): Promise<Rfi[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    
    if (filter.tenantId) {
      params.push(filter.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }
    if (filter.projectId) {
      params.push(filter.projectId);
      where.push(`project_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 100);
    
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_rfis ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToRfi);
  }

  async listPaged(filter: RfiFilter, page: PageParams): Promise<Page<Rfi>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('project_id', filter.projectId);
    add('status', filter.status);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_engineering_rfis ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_rfis ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToRfi), total, page);
  }
}
