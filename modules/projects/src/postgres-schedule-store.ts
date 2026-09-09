import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { ProjectSchedule, ScheduleTask } from './domain/schedule';
import type { ScheduleStore } from './schedule-store';

/**
 * Schedule persistence (§22 Step 2A).
 *
 * TASKS ARE ROWS, and the rows are the authority. `aura_projects_schedules.tasks` is still written
 * as a mirror, deliberately: migration 0284 does not drop it, so a rollback to pre-cutover code
 * finds a JSONB array that is current rather than frozen at migration time. It is never read here.
 * A later migration drops the column and this mirror goes with it.
 *
 * Reading from rows is what gives a task an identity that survives a save — see the domain's
 * `setScheduleTasks`, which now carries baselines forward by id instead of by name.
 */

interface Row {
  id: string; tenant_id: string; company_id: string | null; project_id: string; project_name: string | null;
  baseline_set_at: Date | string | null; created_by: string | null; created_at: Date | string; updated_at: Date | string;
}

interface TaskRow {
  id: string; schedule_id: string; name: string;
  planned_start: Date | string; planned_end: Date | string;
  baseline_start: Date | string | null; baseline_end: Date | string | null;
  actual_start: Date | string | null; actual_end: Date | string | null;
  percent_complete: string | number;
}

const COLS = 'id, tenant_id, company_id, project_id, project_name, baseline_set_at, created_by, created_at, updated_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));
const day = (v: Date | string | null): string | null =>
  v === null ? null : typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);

const rowToTask = (r: TaskRow): ScheduleTask => ({
  id: r.id,
  name: r.name,
  plannedStart: day(r.planned_start)!,
  plannedEnd: day(r.planned_end)!,
  baselineStart: day(r.baseline_start),
  baselineEnd: day(r.baseline_end),
  actualStart: day(r.actual_start),
  actualEnd: day(r.actual_end),
  percentComplete: Number(r.percent_complete),
});

function rowTo(r: Row, tasks: ScheduleTask[]): ProjectSchedule {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, projectId: r.project_id,
    projectName: r.project_name, tasks,
    baselineSetAt: r.baseline_set_at ? iso(r.baseline_set_at) : null,
    createdBy: r.created_by, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  };
}

export class PostgresScheduleStore implements ScheduleStore {
  constructor(private readonly pool: Pool) {}

  async create(s: ProjectSchedule): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_schedules (${COLS}, tasks) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [s.id, s.tenantId, s.companyId, s.projectId, s.projectName, s.baselineSetAt, s.createdBy,
       s.createdAt, s.updatedAt, JSON.stringify(s.tasks)],
    );
    await this.writeTasks(this.pool, s);
  }

  async update(s: ProjectSchedule): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_projects_schedules SET baseline_set_at=$2, updated_at=$3, tasks=$4::jsonb WHERE id=$1`,
      [s.id, s.baselineSetAt, s.updatedAt, JSON.stringify(s.tasks)],
    );
    await this.writeTasks(this.pool, s);
  }

  /**
   * Replace the schedule's task rows.
   *
   * Delete-then-insert rather than a diff: the domain has already decided which tasks survive and
   * what their ids are, so a task absent from `s.tasks` is one the caller deleted. Re-inserting by
   * the SAME id is what preserves identity across a save — nothing here mints one.
   */
  private async writeTasks(executor: Pool | PoolClient, s: ProjectSchedule): Promise<void> {
    await executor.query('DELETE FROM public.aura_projects_schedule_tasks WHERE schedule_id = $1', [s.id]);
    for (const t of s.tasks) {
      await executor.query(
        `INSERT INTO public.aura_projects_schedule_tasks
           (id, tenant_id, project_id, schedule_id, name, planned_start, planned_end,
            baseline_start, baseline_end, actual_start, actual_end, percent_complete, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())`,
        [t.id, s.tenantId, s.projectId, s.id, t.name, t.plannedStart, t.plannedEnd,
         t.baselineStart, t.baselineEnd, t.actualStart, t.actualEnd, t.percentComplete],
      );
    }
  }

  private async tasksFor(scheduleIds: string[]): Promise<Map<string, ScheduleTask[]>> {
    const out = new Map<string, ScheduleTask[]>();
    if (scheduleIds.length === 0) return out;
    // One query for every schedule in the result, not one per schedule.
    const res = await this.pool.query<TaskRow>(
      `SELECT id, schedule_id, name, planned_start, planned_end, baseline_start, baseline_end,
              actual_start, actual_end, percent_complete
         FROM public.aura_projects_schedule_tasks
        WHERE schedule_id = ANY($1::uuid[])
        ORDER BY planned_start, id`,
      [scheduleIds],
    );
    for (const r of res.rows) {
      const bucket = out.get(r.schedule_id) ?? [];
      bucket.push(rowToTask(r));
      out.set(r.schedule_id, bucket);
    }
    return out;
  }

  async get(id: Id): Promise<ProjectSchedule | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_projects_schedules WHERE id = $1`, [id]);
    if (!res.rows.length) return null;
    const tasks = await this.tasksFor([res.rows[0].id]);
    return rowTo(res.rows[0], tasks.get(res.rows[0].id) ?? []);
  }

  async getByProject(tenantId: Id, projectId: Id): Promise<ProjectSchedule | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_schedules WHERE tenant_id = $1 AND project_id = $2`,
      [tenantId, projectId],
    );
    if (!res.rows.length) return null;
    const tasks = await this.tasksFor([res.rows[0].id]);
    return rowTo(res.rows[0], tasks.get(res.rows[0].id) ?? []);
  }

  async list(tenantId: Id): Promise<ProjectSchedule[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_schedules WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [tenantId],
    );
    const tasks = await this.tasksFor(res.rows.map((r) => r.id));
    return res.rows.map((r) => rowTo(r, tasks.get(r.id) ?? []));
  }
}
