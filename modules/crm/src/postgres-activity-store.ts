import type { Pool } from 'pg';
import type { Id, Page, PageParams } from '@aura/shared';
import { makePage } from '@aura/shared';
import type { Activity } from './domain/activity';
import type { ActivityFilter, ActivityStore, ActivitySummary } from './activity-store';

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
  reminder_at: Date | string | null;
  reminder_sent_at: Date | string | null;
  recurrence: string;
  recurrence_ends_on: string | null;
  recurrence_series_id: string | null;
  status: string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  outcome: string | null;
  direction: string | null;
  counterparty: string | null;
  assignee_id: string | null;
  created_by: string | null;
  created_at: Date | string;
}

const COLS =
  'id, tenant_id, company_id, type, subject, notes, related_type, related_id, related_name, due_date, reminder_at, reminder_sent_at, recurrence, recurrence_ends_on, recurrence_series_id, status, started_at, completed_at, outcome, direction, counterparty, assignee_id, created_by, created_at';

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
    reminderAt: r.reminder_at instanceof Date ? r.reminder_at.toISOString() : (r.reminder_at ? String(r.reminder_at) : null),
    reminderSentAt: r.reminder_sent_at instanceof Date ? r.reminder_sent_at.toISOString() : (r.reminder_sent_at ? String(r.reminder_sent_at) : null),
    recurrence: (r.recurrence || 'none') as Activity['recurrence'],
    recurrenceEndsOn: r.recurrence_ends_on,
    recurrenceSeriesId: r.recurrence_series_id,
    status: r.status as Activity['status'],
    startedAt: r.started_at instanceof Date ? r.started_at.toISOString() : (r.started_at ? String(r.started_at) : null),
    completedAt: r.completed_at instanceof Date ? r.completed_at.toISOString() : (r.completed_at ? String(r.completed_at) : null),
    outcome: r.outcome,
    direction: r.direction as Activity['direction'],
    counterparty: r.counterparty,
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
      `INSERT INTO public.aura_crm_activities (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT (id) DO UPDATE SET
         subject = EXCLUDED.subject, notes = EXCLUDED.notes, due_date = EXCLUDED.due_date,
         reminder_at = EXCLUDED.reminder_at, reminder_sent_at = EXCLUDED.reminder_sent_at,
         recurrence = EXCLUDED.recurrence, recurrence_ends_on = EXCLUDED.recurrence_ends_on, recurrence_series_id = EXCLUDED.recurrence_series_id,
         status = EXCLUDED.status, started_at = EXCLUDED.started_at, completed_at = EXCLUDED.completed_at, outcome = EXCLUDED.outcome,
         direction = EXCLUDED.direction, counterparty = EXCLUDED.counterparty,
         assignee_id = EXCLUDED.assignee_id`,
      [a.id, a.tenantId, a.companyId, a.type, a.subject, a.notes, a.relatedType, a.relatedId, a.relatedName, a.dueDate, a.reminderAt ?? null, a.reminderSentAt ?? null, a.recurrence ?? 'none', a.recurrenceEndsOn ?? null, a.recurrenceSeriesId ?? null, a.status, a.startedAt, a.completedAt, a.outcome, a.direction, a.counterparty, a.assigneeId, a.createdBy, a.createdAt],
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
    add('assignee_id', filter.assigneeId);
    add('created_by', filter.createdBy);
    add('related_type', filter.relatedType);
    add('related_id', filter.relatedId);
    add('status', filter.status);
    add('type', filter.type);
    if (filter.dueDateFrom) { params.push(filter.dueDateFrom); where.push(`due_date >= $${params.length}`); }
    if (filter.dueDateTo) { params.push(filter.dueDateTo); where.push(`due_date <= $${params.length}`); }
    if (filter.search?.trim()) {
      params.push(`%${filter.search.trim()}%`);
      where.push(`(subject ILIKE $${params.length} OR notes ILIKE $${params.length} OR related_name ILIKE $${params.length} OR counterparty ILIKE $${params.length} OR assignee_id ILIKE $${params.length})`);
    }
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

  async listAll(filter: ActivityFilter = {}): Promise<Activity[]> {
    const { whereSql, params } = this.buildWhere(filter);
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_crm_activities ${whereSql} ORDER BY created_at DESC`,
      params,
    );
    return res.rows.map(rowToActivity);
  }

  async summary(filter: ActivityFilter = {}, now = new Date()): Promise<ActivitySummary> {
    const { whereSql, params } = this.buildWhere(filter);
    const today = now.toISOString().slice(0, 10);
    const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const res = await this.pool.query<{
      total: string; open: string; overdue: string; due_today: string; due_this_week: string; completed30: string; unassigned: string;
    }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open,
         COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND due_date < $${params.length + 1})::int AS overdue,
         COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND due_date = $${params.length + 1})::int AS due_today,
         COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND due_date > $${params.length + 1} AND due_date <= $${params.length + 2})::int AS due_this_week,
         COUNT(*) FILTER (WHERE status = 'completed' AND COALESCE(completed_at::text, created_at::text) >= $${params.length + 3})::int AS completed30,
         COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND assignee_id IS NULL)::int AS unassigned
       FROM public.aura_crm_activities ${whereSql}`,
      [...params, today, weekEnd, monthAgo],
    );
    const row = res.rows[0];
    return {
      total: Number(row?.total ?? 0), open: Number(row?.open ?? 0), overdue: Number(row?.overdue ?? 0),
      dueToday: Number(row?.due_today ?? 0), dueThisWeek: Number(row?.due_this_week ?? 0),
      completed30: Number(row?.completed30 ?? 0), unassigned: Number(row?.unassigned ?? 0),
    };
  }
}
