import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { TechnicalQuery } from './domain/technical-query';
import type { TqFilter, TechnicalQueryStore } from './technical-query-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  code: string;
  title: string;
  query: string;
  response: string | null;
  status: string;
  priority: string;
  discipline: string;
  drawing_reference: string | null;
  cost_impact: boolean;
  time_impact: boolean;
  project_id: string;
  project_name: string | null;
  assigned_to: string | null;
  responded_at: Date | string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, code, title, query, response, status, priority, discipline, drawing_reference, cost_impact, time_impact, project_id, project_name, assigned_to, responded_at, created_by, created_at, updated_at';

function rowToTq(r: Row): TechnicalQuery {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    code: r.code,
    title: r.title,
    query: r.query,
    response: r.response,
    status: r.status as TechnicalQuery['status'],
    priority: r.priority as TechnicalQuery['priority'],
    discipline: r.discipline as TechnicalQuery['discipline'],
    drawingReference: r.drawing_reference,
    costImpact: r.cost_impact,
    timeImpact: r.time_impact,
    projectId: r.project_id,
    projectName: r.project_name,
    assignedTo: r.assigned_to,
    respondedAt: r.responded_at instanceof Date ? r.responded_at.toISOString() : (r.responded_at ? String(r.responded_at) : null),
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export class PostgresTechnicalQueryStore implements TechnicalQueryStore {
  constructor(private readonly pool: Pool) {}

  async create(t: TechnicalQuery): Promise<void> {
    await this.insert(this.pool, t);
  }

  async createWithClient(tx: TxHandle | null, t: TechnicalQuery): Promise<void> {
    if (tx === null) return this.create(t);
    await this.insert(tx as PoolClient, t);
  }

  private insert(executor: Pool | PoolClient, t: TechnicalQuery): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_engineering_technical_queries (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [t.id, t.tenantId, t.companyId, t.code, t.title, t.query, t.response, t.status, t.priority, t.discipline,
       t.drawingReference, t.costImpact, t.timeImpact, t.projectId, t.projectName, t.assignedTo, t.respondedAt, t.createdBy, t.createdAt, t.updatedAt],
    );
  }

  async update(t: TechnicalQuery): Promise<void> {
    await this.modify(this.pool, t);
  }

  async updateWithClient(tx: TxHandle | null, t: TechnicalQuery): Promise<void> {
    if (tx === null) return this.update(t);
    await this.modify(tx as PoolClient, t);
  }

  private modify(executor: Pool | PoolClient, t: TechnicalQuery): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_engineering_technical_queries
       SET title=$2, query=$3, response=$4, status=$5, priority=$6, drawing_reference=$7, cost_impact=$8, time_impact=$9, assigned_to=$10, responded_at=$11, updated_at=now()
       WHERE id=$1`,
      [t.id, t.title, t.query, t.response, t.status, t.priority, t.drawingReference, t.costImpact, t.timeImpact, t.assignedTo, t.respondedAt],
    );
  }

  async get(id: Id): Promise<TechnicalQuery | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_engineering_technical_queries WHERE id = $1`, [id]);
    return res.rows.length ? rowToTq(res.rows[0]) : null;
  }

  private buildWhere(filter: TqFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('project_id', filter.projectId);
    add('status', filter.status);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: TqFilter = {}): Promise<TechnicalQuery[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_technical_queries ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToTq);
  }

  async listPaged(filter: TqFilter, page: PageParams): Promise<Page<TechnicalQuery>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_engineering_technical_queries ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_technical_queries ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToTq), total, page);
  }
}
