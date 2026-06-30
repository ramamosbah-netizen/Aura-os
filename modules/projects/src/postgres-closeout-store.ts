import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ProjectCloseout, CloseoutItem } from './domain/closeout';
import type { CloseoutFilter, CloseoutStore } from './closeout-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  project_id: string;
  project_name: string | null;
  status: string;
  items: unknown;
  handover_date: string | null;
  dlp_end_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, project_id, project_name, status, items, handover_date::text, dlp_end_date::text, notes, created_by, created_at, updated_at';

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowToCloseout(r: Row): ProjectCloseout {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    projectId: r.project_id,
    projectName: r.project_name,
    status: r.status as ProjectCloseout['status'],
    items: (typeof r.items === 'string' ? JSON.parse(r.items) : r.items) as CloseoutItem[],
    handoverDate: r.handover_date,
    dlpEndDate: r.dlp_end_date,
    notes: r.notes ?? '',
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

/** Durable project closeouts on Postgres (`aura_projects_closeouts`). */
export class PostgresCloseoutStore implements CloseoutStore {
  constructor(private readonly pool: Pool) {}

  async create(c: ProjectCloseout): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_closeouts
        (id, tenant_id, company_id, project_id, project_name, status, items, handover_date, dlp_end_date, notes, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13)`,
      [c.id, c.tenantId, c.companyId, c.projectId, c.projectName, c.status, JSON.stringify(c.items), c.handoverDate, c.dlpEndDate, c.notes, c.createdBy, c.createdAt, c.updatedAt],
    );
  }

  async update(c: ProjectCloseout): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_projects_closeouts
         SET status=$2, items=$3::jsonb, handover_date=$4, dlp_end_date=$5, notes=$6, updated_at=$7 WHERE id=$1`,
      [c.id, c.status, JSON.stringify(c.items), c.handoverDate, c.dlpEndDate, c.notes, c.updatedAt],
    );
  }

  async get(id: Id): Promise<ProjectCloseout | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_projects_closeouts WHERE id = $1`, [id]);
    return res.rows.length ? rowToCloseout(res.rows[0]) : null;
  }

  async getByProject(tenantId: Id, projectId: Id): Promise<ProjectCloseout | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_closeouts WHERE tenant_id = $1 AND project_id = $2`,
      [tenantId, projectId],
    );
    return res.rows.length ? rowToCloseout(res.rows[0]) : null;
  }

  async list(filter: CloseoutFilter = {}): Promise<ProjectCloseout[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('project_id', filter.projectId);
    add('status', filter.status);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_closeouts ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToCloseout);
  }
}
