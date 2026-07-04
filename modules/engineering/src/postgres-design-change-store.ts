import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { DesignChange } from './domain/design-change';
import type { DesignChangeFilter, DesignChangeStore } from './design-change-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  code: string;
  title: string;
  description: string | null;
  discipline: string;
  change_type: string;
  cost_impact: boolean;
  estimated_value: string | number;
  status: string;
  project_id: string;
  project_name: string | null;
  owner_id: string | null;
  created_by: string | null;
  decided_by: string | null;
  decided_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, code, title, description, discipline, change_type, cost_impact, estimated_value, status, project_id, project_name, owner_id, created_by, decided_by, decided_at, created_at, updated_at';

function rowToDc(r: Row): DesignChange {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    code: r.code,
    title: r.title,
    description: r.description,
    discipline: r.discipline as DesignChange['discipline'],
    changeType: r.change_type as DesignChange['changeType'],
    costImpact: r.cost_impact,
    estimatedValue: Number(r.estimated_value) || 0,
    status: r.status as DesignChange['status'],
    projectId: r.project_id,
    projectName: r.project_name,
    ownerId: r.owner_id,
    createdBy: r.created_by,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at instanceof Date ? r.decided_at.toISOString() : (r.decided_at ? String(r.decided_at) : null),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export class PostgresDesignChangeStore implements DesignChangeStore {
  constructor(private readonly pool: Pool) {}

  async create(d: DesignChange): Promise<void> {
    await this.insert(this.pool, d);
  }

  async createWithClient(tx: TxHandle | null, d: DesignChange): Promise<void> {
    if (tx === null) return this.create(d);
    await this.insert(tx as PoolClient, d);
  }

  private insert(executor: Pool | PoolClient, d: DesignChange): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_engineering_design_changes (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [d.id, d.tenantId, d.companyId, d.code, d.title, d.description, d.discipline, d.changeType, d.costImpact,
       d.estimatedValue, d.status, d.projectId, d.projectName, d.ownerId, d.createdBy, d.decidedBy, d.decidedAt, d.createdAt, d.updatedAt],
    );
  }

  async update(d: DesignChange): Promise<void> {
    await this.modify(this.pool, d);
  }

  async updateWithClient(tx: TxHandle | null, d: DesignChange): Promise<void> {
    if (tx === null) return this.update(d);
    await this.modify(tx as PoolClient, d);
  }

  private modify(executor: Pool | PoolClient, d: DesignChange): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_engineering_design_changes
       SET title=$2, description=$3, discipline=$4, change_type=$5, cost_impact=$6, estimated_value=$7, status=$8, decided_by=$9, decided_at=$10, updated_at=now()
       WHERE id=$1`,
      [d.id, d.title, d.description, d.discipline, d.changeType, d.costImpact, d.estimatedValue, d.status, d.decidedBy, d.decidedAt],
    );
  }

  async get(id: Id): Promise<DesignChange | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_engineering_design_changes WHERE id = $1`, [id]);
    return res.rows.length ? rowToDc(res.rows[0]) : null;
  }

  private buildWhere(filter: DesignChangeFilter): { whereSql: string; params: unknown[] } {
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

  async list(filter: DesignChangeFilter = {}): Promise<DesignChange[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_design_changes ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToDc);
  }

  async listPaged(filter: DesignChangeFilter, page: PageParams): Promise<Page<DesignChange>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_engineering_design_changes ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_design_changes ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToDc), total, page);
  }
}
