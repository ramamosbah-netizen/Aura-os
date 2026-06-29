import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { Drawing } from './domain/drawing';
import type { DrawingFilter, DrawingStore } from './drawing-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  code: string;
  title: string;
  revision: string;
  status: string;
  project_id: string;
  project_name: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, code, title, revision, status, project_id, project_name, owner_id, created_by, created_at, updated_at';

function rowToDrawing(r: Row): Drawing {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    code: r.code,
    title: r.title,
    revision: r.revision,
    status: r.status as Drawing['status'],
    projectId: r.project_id,
    projectName: r.project_name,
    ownerId: r.owner_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export class PostgresDrawingStore implements DrawingStore {
  constructor(private readonly pool: Pool) {}

  async create(d: Drawing): Promise<void> {
    await this.insert(this.pool, d);
  }

  async createWithClient(tx: TxHandle | null, d: Drawing): Promise<void> {
    if (tx === null) return this.create(d);
    await this.insert(tx as PoolClient, d);
  }

  private insert(executor: Pool | PoolClient, d: Drawing): Promise<unknown> {
    return executor.query(
      `INSERT INTO public.aura_engineering_drawings (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [d.id, d.tenantId, d.companyId, d.code, d.title, d.revision, d.status, d.projectId, d.projectName, d.ownerId, d.createdBy, d.createdAt, d.updatedAt],
    );
  }

  async update(d: Drawing): Promise<void> {
    await this.modify(this.pool, d);
  }

  async updateWithClient(tx: TxHandle | null, d: Drawing): Promise<void> {
    if (tx === null) return this.update(d);
    await this.modify(tx as PoolClient, d);
  }

  private modify(executor: Pool | PoolClient, d: Drawing): Promise<unknown> {
    return executor.query(
      `UPDATE public.aura_engineering_drawings 
       SET title=$2, revision=$3, status=$4, project_id=$5, project_name=$6, owner_id=$7, updated_at=now()
       WHERE id=$1`,
      [d.id, d.title, d.revision, d.status, d.projectId, d.projectName, d.ownerId],
    );
  }

  async get(id: Id): Promise<Drawing | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_drawings WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToDrawing(res.rows[0]) : null;
  }

  async getByCode(tenantId: Id, projectId: Id, code: string, revision: string): Promise<Drawing | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_drawings 
       WHERE tenant_id = $1 AND project_id = $2 AND code = $3 AND revision = $4`,
      [tenantId, projectId, code, revision],
    );
    return res.rows.length ? rowToDrawing(res.rows[0]) : null;
  }

  async list(filter: DrawingFilter = {}): Promise<Drawing[]> {
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
      `SELECT ${COLS} FROM public.aura_engineering_drawings ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToDrawing);
  }
}
