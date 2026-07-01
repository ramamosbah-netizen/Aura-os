import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ProjectSchedule, ScheduleTask } from './domain/schedule';
import type { ScheduleStore } from './schedule-store';

interface Row {
  id: string; tenant_id: string; company_id: string | null; project_id: string; project_name: string | null;
  tasks: unknown; baseline_set_at: Date | string | null; created_by: string | null; created_at: Date | string; updated_at: Date | string;
}

const COLS = 'id, tenant_id, company_id, project_id, project_name, tasks, baseline_set_at, created_by, created_at, updated_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

function rowTo(r: Row): ProjectSchedule {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, projectId: r.project_id, projectName: r.project_name,
    tasks: (typeof r.tasks === 'string' ? JSON.parse(r.tasks) : r.tasks) as ScheduleTask[],
    baselineSetAt: r.baseline_set_at ? iso(r.baseline_set_at) : null,
    createdBy: r.created_by, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  };
}

export class PostgresScheduleStore implements ScheduleStore {
  constructor(private readonly pool: Pool) {}

  async create(s: ProjectSchedule): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_schedules (${COLS}) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,
      [s.id, s.tenantId, s.companyId, s.projectId, s.projectName, JSON.stringify(s.tasks), s.baselineSetAt, s.createdBy, s.createdAt, s.updatedAt],
    );
  }

  async update(s: ProjectSchedule): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_projects_schedules SET tasks=$2::jsonb, baseline_set_at=$3, updated_at=$4 WHERE id=$1`,
      [s.id, JSON.stringify(s.tasks), s.baselineSetAt, s.updatedAt],
    );
  }

  async get(id: Id): Promise<ProjectSchedule | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_projects_schedules WHERE id = $1`, [id]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async getByProject(tenantId: Id, projectId: Id): Promise<ProjectSchedule | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_projects_schedules WHERE tenant_id = $1 AND project_id = $2`, [tenantId, projectId]);
    return res.rows.length ? rowTo(res.rows[0]) : null;
  }

  async list(tenantId: Id): Promise<ProjectSchedule[]> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_projects_schedules WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`, [tenantId]);
    return res.rows.map(rowTo);
  }
}
