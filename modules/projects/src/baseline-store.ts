import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { BaselineRevision } from './domain/schedule';

/**
 * Where a baselining act is kept.
 *
 * A baseline is what every variance figure on a project is measured against, so replacing one
 * destroys evidence unless the old one survives. This store is append-only by design and by grant
 * (migration 0327 grants SELECT and INSERT and nothing else): a revision is a thing that happened,
 * and an act that could be edited afterwards is not a record of anything.
 */
export const SCHEDULE_BASELINE_STORE = Symbol('SCHEDULE_BASELINE_STORE');

export interface RecordedBaseline extends BaselineRevision {
  tenantId: Id;
  projectId: Id;
  scheduleId: Id;
}

export interface ScheduleBaselineStore {
  record(revision: RecordedBaseline): Promise<void>;
  /** Every revision for a schedule, newest first. */
  listForSchedule(tenantId: Id, scheduleId: Id): Promise<RecordedBaseline[]>;
}

/** In-memory, for a composition with no database. Same contract, same append-only behaviour. */
export class InMemoryScheduleBaselineStore implements ScheduleBaselineStore {
  private readonly rows: RecordedBaseline[] = [];

  async record(revision: RecordedBaseline): Promise<void> {
    this.rows.push({ ...revision, tasks: revision.tasks.map((task) => ({ ...task })) });
  }

  async listForSchedule(tenantId: Id, scheduleId: Id): Promise<RecordedBaseline[]> {
    return this.rows
      .filter((row) => row.tenantId === tenantId && row.scheduleId === scheduleId)
      .sort((a, b) => b.revision - a.revision)
      .map((row) => ({ ...row, tasks: row.tasks.map((task) => ({ ...task })) }));
  }
}

export class PostgresScheduleBaselineStore implements ScheduleBaselineStore {
  constructor(private readonly pool: Pool) {}

  async record(revision: RecordedBaseline): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_schedule_baselines
         (id, tenant_id, project_id, schedule_id, revision, set_at, set_by, reason, tasks)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT (schedule_id, revision) DO NOTHING`,
      [revision.tenantId, revision.projectId, revision.scheduleId, revision.revision,
       revision.setAt, revision.setBy, revision.reason, JSON.stringify(revision.tasks)],
    );
  }

  async listForSchedule(tenantId: Id, scheduleId: Id): Promise<RecordedBaseline[]> {
    const { rows } = await this.pool.query<{
      tenant_id: string; project_id: string; schedule_id: string; revision: number;
      set_at: Date | string; set_by: string | null; reason: string | null;
      tasks: RecordedBaseline['tasks'];
    }>(
      `SELECT tenant_id, project_id, schedule_id, revision, set_at, set_by, reason, tasks
         FROM public.aura_projects_schedule_baselines
        WHERE tenant_id = $1 AND schedule_id = $2
        ORDER BY revision DESC`,
      [tenantId, scheduleId],
    );
    return rows.map((row) => ({
      tenantId: row.tenant_id,
      projectId: row.project_id,
      scheduleId: row.schedule_id,
      revision: Number(row.revision),
      setAt: row.set_at instanceof Date ? row.set_at.toISOString() : String(row.set_at),
      setBy: row.set_by,
      reason: row.reason,
      tasks: row.tasks ?? [],
    }));
  }
}
