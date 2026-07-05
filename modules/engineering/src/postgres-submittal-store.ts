import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Submittal } from './domain/submittal';
import type { SubmittalFilter, SubmittalStore } from './submittal-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  code: string;
  title: string;
  submittal_type: string;
  status: string;
  discipline: string;
  project_id: string;
  project_name: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, code, title, submittal_type, status, discipline, project_id, project_name, owner_id, created_by, created_at, updated_at';

function rowToSubmittal(r: Row): Submittal {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    code: r.code,
    title: r.title,
    submittalType: r.submittal_type as Submittal['submittalType'],
    status: r.status as Submittal['status'],
    discipline: r.discipline as Submittal['discipline'],
    projectId: r.project_id,
    projectName: r.project_name,
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export class PostgresSubmittalStore implements SubmittalStore {
  constructor(private readonly pool: Pool) {}

  async create(s: Submittal): Promise<void> {
    await this.insert(this.pool, s);
  }

  async createWithClient(tx: TxHandle | null, s: Submittal): Promise<void> {
    if (tx === null) return this.create(s);
    await this.insert(tx as PoolClient, s);
  }

  private insert(executor: Pool | PoolClient, s: Submittal): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_engineering_submittals (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        s.id, s.tenantId, s.companyId, s.code, s.title, s.submittalType, s.status, s.discipline,
        s.projectId, s.projectName, s.ownerId, s.createdBy, s.createdAt, s.updatedAt
      ],
    );
  }

  async update(s: Submittal): Promise<void> {
    await this.modify(this.pool, s);
  }

  async updateWithClient(tx: TxHandle | null, s: Submittal): Promise<void> {
    if (tx === null) return this.update(s);
    await this.modify(tx as PoolClient, s);
  }

  private modify(executor: Pool | PoolClient, s: Submittal): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_engineering_submittals
       SET title=$2, submittal_type=$3, status=$4, discipline=$5, owner_id=$6, updated_at=now()
       WHERE id=$1`,
      [s.id, s.title, s.submittalType, s.status, s.discipline, s.ownerId],
    );
  }

  async get(id: Id): Promise<Submittal | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_submittals WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToSubmittal(res.rows[0]) : null;
  }

  async getByCode(tenantId: Id, projectId: Id, code: string): Promise<Submittal | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_submittals 
       WHERE tenant_id = $1 AND project_id = $2 AND code = $3`,
      [tenantId, projectId, code],
    );
    return res.rows.length ? rowToSubmittal(res.rows[0]) : null;
  }

  async list(filter: SubmittalFilter = {}): Promise<Submittal[]> {
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
      `SELECT ${COLS} FROM public.aura_engineering_submittals ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToSubmittal);
  }

  async listPaged(filter: SubmittalFilter, page: PageParams): Promise<Page<Submittal>> {
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
      `SELECT COUNT(*)::int AS count FROM public.aura_engineering_submittals ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_submittals ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToSubmittal), total, page);
  }
}
