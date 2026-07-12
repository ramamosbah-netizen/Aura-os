import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { Activity } from './domain/activity';
import type { ActivityFilter, ActivityStore } from './activity-store';

interface Row {
  id: string;
  tenant_id: string;
  company_id: string | null;
  type: string;
  subject: string;
  notes: string | null;
  related_type: string | null;
  related_id: string | null;
  related_name: string | null;
  due_date: string | null;
  status: string;
  completed_at: Date | string | null;
  outcome: string | null;
  assignee_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, type, subject, notes, related_type, related_id, related_name, due_date, status, completed_at, outcome, assignee_id, created_by, created_at';

function rowToActivity(r: Row): Activity {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    companyId: r.company_id,
    type: r.type as Activity['type'],
    subject: r.subject,
    notes: r.notes,
    relatedType: r.related_type as Activity['relatedType'],
    relatedId: r.related_id,
    relatedName: r.related_name,
    dueDate: r.due_date,
    status: r.status as Activity['status'],
    completedAt: r.completed_at instanceof Date ? r.completed_at.toISOString() : (r.completed_at ? String(r.completed_at) : null),
    outcome: r.outcome,
    assigneeId: r.assignee_id,
    createdBy: r.created_by,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

/** Durable CRM activities on Postgres (`aura_crm_activities`). */
export class PostgresActivityStore implements ActivityStore {
  constructor(private readonly pool: Pool) {}

  async save(a: Activity): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_crm_activities (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO UPDATE SET
         subject = EXCLUDED.subject, notes = EXCLUDED.notes, due_date = EXCLUDED.due_date,
         status = EXCLUDED.status, completed_at = EXCLUDED.completed_at, outcome = EXCLUDED.outcome,
         assignee_id = EXCLUDED.assignee_id`,
      [a.id, a.tenantId, a.companyId, a.type, a.subject, a.notes, a.relatedType, a.relatedId, a.relatedName, a.dueDate, a.status, a.completedAt, a.outcome, a.assigneeId, a.createdBy, a.createdAt],
    );
  }

  async get(id: Id): Promise<Activity | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_crm_activities WHERE id = $1`, [id]);
    return res.rows.length ? rowToActivity(res.rows[0]) : null;
  }

  private buildWhere(filter: ActivityFilter): { whereSql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (col: string, val?: string): void => {
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    };
    add('tenant_id', filter.tenantId);
    add('related_type', filter.relatedType);
    add('related_id', filter.relatedId);
    add('status', filter.status);
    add('type', filter.type);
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  }

  async list(filter: ActivityFilter = {}): Promise<Activity[]> {
    const { whereSql, params } = this.buildWhere(filter);
    params.push(filter.limit ?? 100);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_activities ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToActivity);
  }

  async listPaged(filter: ActivityFilter, page: PageParams): Promise<Page<Activity>> {
    const { whereSql, params } = this.buildWhere(filter);
    const countRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM public.aura_crm_activities ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.count ?? 0);
    const winParams = [...params, page.limit, page.offset];
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_activities ${whereSql} ORDER BY created_at DESC LIMIT $${winParams.length - 1} OFFSET $${winParams.length}`,
      winParams,
    );
    return makePage(res.rows.map(rowToActivity), total, page);
  }
}
