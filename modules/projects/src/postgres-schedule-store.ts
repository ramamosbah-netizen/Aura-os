import type { Pool, PoolClient } from 'pg';
import type { Id } from '@aura/shared';
import type { ProjectSchedule, ScheduleTask, TaskResourceRequirement } from './domain/schedule';
import type { ResourceType, ResourceUnit } from './domain/resource-ref';
import type { ScheduleDependency } from './domain/schedule-network';
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
  wbs_node_id: string | null;
  planned_start: Date | string; planned_end: Date | string;
  baseline_start: Date | string | null; baseline_end: Date | string | null;
  actual_start: Date | string | null; actual_end: Date | string | null;
  percent_complete: string | number;
  duration_working_days: number | null;
  progress_override: string | number | null; progress_override_reason: string | null;
  progress_override_at: Date | string | null; progress_override_by: string | null;
}

interface ReqRow {
  id: string; task_id: string; resource_type: string; canonical_resource_id: string;
  unit: string; quantity: string | number;
}

interface DepRow {
  id: string; tenant_id: string; project_id: string; schedule_id: string;
  predecessor_task_id: string; successor_task_id: string;
}

const COLS = 'id, tenant_id, company_id, project_id, project_name, baseline_set_at, created_by, created_at, updated_at';
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));
const day = (v: Date | string | null): string | null =>
  v === null ? null : typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);

const rowToReq = (r: ReqRow): TaskResourceRequirement => ({
  id: r.id,
  resource: { resourceType: r.resource_type as ResourceType, canonicalResourceId: r.canonical_resource_id },
  unit: r.unit as ResourceUnit,
  quantity: Number(r.quantity),
});

const rowToTask = (r: TaskRow, requirements: TaskResourceRequirement[] = []): ScheduleTask => ({
  id: r.id,
  wbsNodeId: r.wbs_node_id,
  name: r.name,
  plannedStart: day(r.planned_start)!,
  plannedEnd: day(r.planned_end)!,
  baselineStart: day(r.baseline_start),
  baselineEnd: day(r.baseline_end),
  actualStart: day(r.actual_start),
  actualEnd: day(r.actual_end),
  percentComplete: Number(r.percent_complete),
  progressOverride: r.progress_override === null || r.progress_override === undefined ? null : Number(r.progress_override),
  progressOverrideReason: r.progress_override_reason ?? null,
  progressOverrideAt: r.progress_override_at ? iso(r.progress_override_at) : null,
  progressOverrideBy: r.progress_override_by ?? null,
  // NULL stays null. A missing authored duration is a fact to report, not a gap to fill.
  durationWorkingDays: r.duration_working_days === null ? null : Number(r.duration_working_days),
  requirements,
});

const rowToDep = (r: DepRow): ScheduleDependency => ({
  id: r.id, tenantId: r.tenant_id, projectId: r.project_id, scheduleId: r.schedule_id,
  predecessorTaskId: r.predecessor_task_id, successorTaskId: r.successor_task_id,
});

function rowTo(r: Row, tasks: ScheduleTask[], dependencies: ScheduleDependency[] = []): ProjectSchedule {
  return {
    id: r.id, tenantId: r.tenant_id, companyId: r.company_id, projectId: r.project_id,
    projectName: r.project_name, tasks, dependencies,
    baselineSetAt: r.baseline_set_at ? iso(r.baseline_set_at) : null,
    createdBy: r.created_by, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
  };
}

export class PostgresScheduleStore implements ScheduleStore {
  constructor(private readonly pool: Pool) {}

  /**
   * One transaction per save (AURA-PM-004).
   *
   * `writeTasks` deletes every task row before re-inserting it, and that DELETE cascades the
   * schedule's requirements and dependencies with it. Run on the pool, each statement auto-commits:
   * the DELETE lands alone, so a failure or crash before the re-inserts leaves the schedule with no
   * tasks — permanently, on an ordinary edit. Wrapping the row write and `writeTasks` in one
   * transaction makes the save atomic: it either replaces the tasks whole or leaves the prior ones
   * untouched. Nothing partial survives.
   */
  private async tx(fn: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await fn(client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async create(s: ProjectSchedule): Promise<void> {
    await this.tx(async (client) => {
      await client.query(
        `INSERT INTO public.aura_projects_schedules (${COLS}, tasks) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [s.id, s.tenantId, s.companyId, s.projectId, s.projectName, s.baselineSetAt, s.createdBy,
         s.createdAt, s.updatedAt, JSON.stringify(s.tasks)],
      );
      await this.writeTasks(client, s);
    });
  }

  async update(s: ProjectSchedule): Promise<void> {
    await this.tx(async (client) => {
      await client.query(
        `UPDATE public.aura_projects_schedules SET baseline_set_at=$2, updated_at=$3, tasks=$4::jsonb WHERE id=$1`,
        [s.id, s.baselineSetAt, s.updatedAt, JSON.stringify(s.tasks)],
      );
      await this.writeTasks(client, s);
    });
  }

  /**
   * Reconcile the schedule's task rows by DIFF, not delete-and-reinsert (AURA-PM-004 steps 2–3).
   *
   * A surviving task is UPSERTED — its ROW is kept and its columns updated in place — so a foreign
   * key onto it from a booking (migration 0290) stays valid across a plan edit. The previous
   * delete-all-then-reinsert recreated every row on every save; a task's identity survived but its
   * row's lifetime did not, so no external reference to a task could ever be enforced. That is what
   * this ends.
   *
   * REQUIREMENTS ARE DIFFED TOO, since migration 0316 gave a booking a foreign key onto the exact
   * requirement it satisfies. They used to be cleared and re-inserted on every save, which was
   * harmless while nothing referenced them and became a hard stop the moment something did: one
   * held booking anywhere in a plan made the WHOLE plan unsaveable, because the first statement of
   * every save tried to delete the row its booking pointed at. A surviving requirement now keeps
   * its row, and only a requirement the caller actually dropped is deleted — where the foreign key
   * correctly refuses if a commitment still depends on it.
   *
   * Dependencies carry no external foreign key and are still fully re-derived.
   */
  private async writeTasks(executor: Pool | PoolClient, s: ProjectSchedule): Promise<void> {
    // Dependencies are re-derived wholesale; nothing outside the aggregate references them.
    await executor.query('DELETE FROM public.aura_projects_schedule_dependencies WHERE schedule_id = $1', [s.id]);

    // Requirements the caller dropped go now, BEFORE the tasks are diffed, so that removing a task
    // and its demand together works in one save. A requirement a booking still satisfies is refused
    // here by the foreign key (0316) rather than silently taking the commitment's lineage with it.
    const survivingRequirementIds = s.tasks.flatMap((t) => t.requirements.map((req) => req.id));
    try {
      await executor.query(
        'DELETE FROM public.aura_projects_task_requirements WHERE schedule_id = $1 AND id <> ALL($2::uuid[])',
        [s.id, survivingRequirementIds],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23503') {
        // "already" rather than "cannot": the error taxonomy reads this as the state conflict it is
        // (409), not as malformed input (400). The plan is fine; a commitment depends on it.
        throw new Error(
          'this resource requirement already has a held booking; release the booking before removing the demand from the plan',
          { cause: err },
        );
      }
      throw err;
    }

    for (const t of s.tasks) {
      await executor.query(
        `INSERT INTO public.aura_projects_schedule_tasks
           (id, tenant_id, project_id, schedule_id, wbs_node_id, name, planned_start, planned_end,
            baseline_start, baseline_end, actual_start, actual_end, percent_complete,
            duration_working_days, progress_override, progress_override_reason,
            progress_override_at, progress_override_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now())
         ON CONFLICT (id) DO UPDATE SET
           wbs_node_id = EXCLUDED.wbs_node_id,
           name = EXCLUDED.name,
           planned_start = EXCLUDED.planned_start, planned_end = EXCLUDED.planned_end,
           baseline_start = EXCLUDED.baseline_start, baseline_end = EXCLUDED.baseline_end,
           actual_start = EXCLUDED.actual_start, actual_end = EXCLUDED.actual_end,
           percent_complete = EXCLUDED.percent_complete,
           duration_working_days = EXCLUDED.duration_working_days,
           progress_override = EXCLUDED.progress_override,
           progress_override_reason = EXCLUDED.progress_override_reason,
           progress_override_at = EXCLUDED.progress_override_at,
           progress_override_by = EXCLUDED.progress_override_by,
           updated_at = now()`,
        [t.id, s.tenantId, s.projectId, s.id, t.wbsNodeId, t.name, t.plannedStart, t.plannedEnd,
         t.baselineStart, t.baselineEnd, t.actualStart, t.actualEnd, t.percentComplete,
         t.durationWorkingDays, t.progressOverride, t.progressOverrideReason,
         t.progressOverrideAt, t.progressOverrideBy],
      );
    }

    // Remove the tasks the caller dropped — those no longer in the aggregate. The booking foreign
    // key's ON DELETE RESTRICT (0290) refuses this when a task still has a live commitment: a task
    // with a crane booked cannot be silently removed from the plan. The address-only reference could
    // not say that; now the database does. The refusal is translated to a clear domain error.
    const survivingIds = s.tasks.map((t) => t.id);
    try {
      await executor.query(
        'DELETE FROM public.aura_projects_schedule_tasks WHERE schedule_id = $1 AND id <> ALL($2::uuid[])',
        [s.id, survivingIds],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23503') {
        throw new Error(
          'this activity already has a held resource booking; release the booking before removing the activity from the plan',
          { cause: err },
        );
      }
      throw err;
    }

    // Requirements and edges are inserted AFTER the tasks they reference, because the composite
    // foreign keys require both endpoints to exist.
    for (const t of s.tasks) {
      for (const req of t.requirements) {
        await executor.query(
          `INSERT INTO public.aura_projects_task_requirements
             (id, tenant_id, project_id, schedule_id, task_id, resource_type, canonical_resource_id, unit, quantity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO UPDATE SET
             task_id = EXCLUDED.task_id,
             resource_type = EXCLUDED.resource_type,
             canonical_resource_id = EXCLUDED.canonical_resource_id,
             unit = EXCLUDED.unit,
             quantity = EXCLUDED.quantity`,
          [req.id, s.tenantId, s.projectId, s.id, t.id,
           req.resource.resourceType, req.resource.canonicalResourceId, req.unit, req.quantity],
        );
      }
    }
    for (const d of s.dependencies) {
      await executor.query(
        `INSERT INTO public.aura_projects_schedule_dependencies
           (id, tenant_id, project_id, schedule_id, predecessor_task_id, successor_task_id)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [d.id, s.tenantId, s.projectId, s.id, d.predecessorTaskId, d.successorTaskId],
      );
    }
  }

  private async reqsFor(scheduleIds: string[]): Promise<Map<string, TaskResourceRequirement[]>> {
    const out = new Map<string, TaskResourceRequirement[]>();
    if (scheduleIds.length === 0) return out;
    const res = await this.pool.query<ReqRow>(
      `SELECT id, task_id, resource_type, canonical_resource_id, unit, quantity
         FROM public.aura_projects_task_requirements
        WHERE schedule_id = ANY($1::uuid[])
        ORDER BY resource_type, canonical_resource_id`,
      [scheduleIds],
    );
    // Keyed by TASK, because that is how they are read back onto the aggregate.
    for (const r of res.rows) {
      const bucket = out.get(r.task_id) ?? [];
      bucket.push(rowToReq(r));
      out.set(r.task_id, bucket);
    }
    return out;
  }

  private async depsFor(scheduleIds: string[]): Promise<Map<string, ScheduleDependency[]>> {
    const out = new Map<string, ScheduleDependency[]>();
    if (scheduleIds.length === 0) return out;
    const res = await this.pool.query<DepRow>(
      `SELECT id, tenant_id, project_id, schedule_id, predecessor_task_id, successor_task_id
         FROM public.aura_projects_schedule_dependencies
        WHERE schedule_id = ANY($1::uuid[])
        ORDER BY predecessor_task_id, successor_task_id`,
      [scheduleIds],
    );
    for (const r of res.rows) {
      const bucket = out.get(r.schedule_id) ?? [];
      bucket.push(rowToDep(r));
      out.set(r.schedule_id, bucket);
    }
    return out;
  }

  private async tasksFor(scheduleIds: string[]): Promise<Map<string, ScheduleTask[]>> {
    const out = new Map<string, ScheduleTask[]>();
    if (scheduleIds.length === 0) return out;
    const reqs = await this.reqsFor(scheduleIds);
    // One query for every schedule in the result, not one per schedule.
    const res = await this.pool.query<TaskRow>(
      `SELECT id, schedule_id, wbs_node_id, name, planned_start, planned_end, baseline_start, baseline_end,
              actual_start, actual_end, percent_complete, duration_working_days, progress_override, progress_override_reason,
              progress_override_at, progress_override_by
         FROM public.aura_projects_schedule_tasks
        WHERE schedule_id = ANY($1::uuid[])
        ORDER BY planned_start, id`,
      [scheduleIds],
    );
    for (const r of res.rows) {
      const bucket = out.get(r.schedule_id) ?? [];
      bucket.push(rowToTask(r, reqs.get(r.id) ?? []));
      out.set(r.schedule_id, bucket);
    }
    return out;
  }

  async get(id: Id): Promise<ProjectSchedule | null> {
    const res = await this.pool.query<Row>(`SELECT ${COLS} FROM public.aura_projects_schedules WHERE id = $1`, [id]);
    if (!res.rows.length) return null;
    const [tasks, deps] = await Promise.all([this.tasksFor([res.rows[0].id]), this.depsFor([res.rows[0].id])]);
    return rowTo(res.rows[0], tasks.get(res.rows[0].id) ?? [], deps.get(res.rows[0].id) ?? []);
  }

  async getByProject(tenantId: Id, projectId: Id): Promise<ProjectSchedule | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_schedules WHERE tenant_id = $1 AND project_id = $2`,
      [tenantId, projectId],
    );
    if (!res.rows.length) return null;
    const [tasks, deps] = await Promise.all([this.tasksFor([res.rows[0].id]), this.depsFor([res.rows[0].id])]);
    return rowTo(res.rows[0], tasks.get(res.rows[0].id) ?? [], deps.get(res.rows[0].id) ?? []);
  }

  async list(tenantId: Id): Promise<ProjectSchedule[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_schedules WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [tenantId],
    );
    const ids = res.rows.map((r) => r.id);
    const [tasks, deps] = await Promise.all([this.tasksFor(ids), this.depsFor(ids)]);
    return res.rows.map((r) => rowTo(r, tasks.get(r.id) ?? [], deps.get(r.id) ?? []));
  }
}
