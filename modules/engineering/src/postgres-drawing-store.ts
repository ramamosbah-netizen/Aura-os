import type { Pool, PoolClient } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
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
  discipline: string;
  project_id: string;
  project_name: string | null;
  owner_id: string | null;
  created_by: string | null;
  previous_revision: string | null;
  reason_for_revision: string | null;
  file_url: string | null;
  submitted_by: string | null;
  submitted_at: Date | string | null;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  decided_by: string | null;
  decided_at: Date | string | null;
  transmittal_ref: string | null;
  transmitted_at: Date | string | null;
  closed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, code, title, revision, status, discipline, project_id, project_name, owner_id, created_by, ' +
  'previous_revision, reason_for_revision, file_url, submitted_by, submitted_at, reviewed_by, reviewed_at, decided_by, decided_at, ' +
  'transmittal_ref, transmitted_at, closed_at, created_at, updated_at';

const ts = (v: Date | string | null): string | null =>
  v === null ? null : v instanceof Date ? v.toISOString() : String(v);

function rowToDrawing(r: Row): Drawing {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    code: r.code,
    title: r.title,
    revision: r.revision,
    status: r.status as Drawing['status'],
    discipline: r.discipline as Drawing['discipline'],
    projectId: r.project_id,
    projectName: r.project_name,
    ownerId: r.owner_id,
    createdBy: r.created_by,
    previousRevision: r.previous_revision,
    reasonForRevision: r.reason_for_revision,
    fileUrl: r.file_url,
    submittedBy: r.submitted_by,
    submittedAt: ts(r.submitted_at),
    reviewedBy: r.reviewed_by,
    reviewedAt: ts(r.reviewed_at),
    decidedBy: r.decided_by,
    decidedAt: ts(r.decided_at),
    transmittalRef: r.transmittal_ref,
    transmittedAt: ts(r.transmitted_at),
    closedAt: ts(r.closed_at),
    createdAt: ts(r.created_at) as string,
    updatedAt: ts(r.updated_at) as string,
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
      `INSERT INTO public.aura_engineering_drawings (${COLS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
      [
        d.id, d.tenantId, d.companyId, d.code, d.title, d.revision, d.status, d.discipline, d.projectId, d.projectName,
        d.ownerId, d.createdBy, d.previousRevision, d.reasonForRevision, d.fileUrl, d.submittedBy, d.submittedAt,
        d.reviewedBy, d.reviewedAt, d.decidedBy, d.decidedAt, d.transmittalRef, d.transmittedAt, d.closedAt,
        d.createdAt, d.updatedAt,
      ],
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
       SET title=$2, revision=$3, status=$4, discipline=$5, project_id=$6, project_name=$7, owner_id=$8,
           previous_revision=$9, reason_for_revision=$10, file_url=$11, submitted_by=$12, submitted_at=$13,
           reviewed_by=$14, reviewed_at=$15, decided_by=$16, decided_at=$17, transmittal_ref=$18,
           transmitted_at=$19, closed_at=$20, updated_at=now()
       WHERE id=$1`,
      [
        d.id, d.title, d.revision, d.status, d.discipline, d.projectId, d.projectName, d.ownerId,
        d.previousRevision, d.reasonForRevision, d.fileUrl, d.submittedBy, d.submittedAt, d.reviewedBy,
        d.reviewedAt, d.decidedBy, d.decidedAt, d.transmittalRef, d.transmittedAt, d.closedAt,
      ],
    );
  }

  async get(id: Id): Promise<Drawing | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_engineering_drawings WHERE id = $1`, [id]);
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

  async getLatestByCode(tenantId: Id, projectId: Id, code: string): Promise<Drawing | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_drawings
       WHERE tenant_id = $1 AND project_id = $2 AND code = $3
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, projectId, code],
    );
    return res.rows.length ? rowToDrawing(res.rows[0]) : null;
  }

  async listRevisions(tenantId: Id, projectId: Id, code: string): Promise<Drawing[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_drawings
       WHERE tenant_id = $1 AND project_id = $2 AND code = $3
       ORDER BY created_at DESC`,
      [tenantId, projectId, code],
    );
    return res.rows.map(rowToDrawing);
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

  async listPaged(filter: DrawingFilter, page: PageParams): Promise<Page<Drawing>> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) {
        params.push(val);
        where.push(`${col} = $${params.length}`);
      }
    };
    add('tenant_id', filter.tenantId);
    add('project_id', filter.projectId);
    add('status', filter.status);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_engineering_drawings ${whereSql}`,
      params,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_engineering_drawings ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToDrawing), total, page);
  }
}
