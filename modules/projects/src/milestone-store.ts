import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { ProjectMilestone } from './domain/milestone';

/**
 * Where a project's milestones are kept.
 *
 * The gating activities travel WITH the milestone rather than through a second store, because a
 * milestone without its gates is not a partial answer — it is a milestone that reads UNKNOWN, and a
 * caller that had to remember a second fetch to avoid that would eventually forget.
 *
 * There is no `status` to store. ON_TRACK, AT_RISK, MISSED and UNKNOWN are derived on every read
 * from the work behind the milestone; see domain/milestone.ts for why a stored verdict is stale the
 * moment an activity moves.
 */
export const MILESTONE_STORE = Symbol('MILESTONE_STORE');

export interface MilestoneFilter {
  tenantId: Id;
  projectId?: Id;
  ownerId?: Id;
}

export interface MilestoneStore {
  create(milestone: ProjectMilestone): Promise<void>;
  update(milestone: ProjectMilestone): Promise<void>;
  get(id: Id): Promise<ProjectMilestone | null>;
  list(filter: MilestoneFilter): Promise<ProjectMilestone[]>;
  /**
   * Remove a milestone.
   *
   * Exists for ONE purpose: to undo a create whose owner receipt could not be raised. Naming an
   * owner is naming a recipient, so a milestone that was saved while its recipient was never told
   * is a half-written record, and the caller compensates rather than leaving one behind. It is not
   * a user-facing delete, and nothing else calls it.
   */
  remove(tenantId: Id, id: Id): Promise<void>;
}

const clone = (milestone: ProjectMilestone): ProjectMilestone => ({
  ...milestone,
  gatingTaskIds: [...milestone.gatingTaskIds],
});

/** In-memory, for a composition with no database. Same contract, same ordering. */
export class InMemoryMilestoneStore implements MilestoneStore {
  private readonly rows = new Map<string, ProjectMilestone>();

  async create(milestone: ProjectMilestone): Promise<void> {
    const clash = [...this.rows.values()].find((row) =>
      row.tenantId === milestone.tenantId && row.projectId === milestone.projectId && row.name === milestone.name,
    );
    // The database enforces this with a UNIQUE constraint; enforcing it here too means a
    // composition without Postgres does not quietly permit what the real one refuses.
    if (clash) throw new Error(`this project already has a milestone called "${milestone.name}"`);
    this.rows.set(milestone.id, clone(milestone));
  }

  async update(milestone: ProjectMilestone): Promise<void> {
    this.rows.set(milestone.id, clone(milestone));
  }

  async get(id: Id): Promise<ProjectMilestone | null> {
    const row = this.rows.get(id);
    return row ? clone(row) : null;
  }

  async remove(tenantId: Id, id: Id): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.tenantId === tenantId) this.rows.delete(id);
  }

  async list(filter: MilestoneFilter): Promise<ProjectMilestone[]> {
    return [...this.rows.values()]
      .filter((row) => row.tenantId === filter.tenantId
        && (!filter.projectId || row.projectId === filter.projectId)
        && (!filter.ownerId || row.ownerId === filter.ownerId))
      // Target date order: a milestone list is read as a run of dates, and the next one due is the
      // one anybody opening this actually came for.
      .sort((a, b) => (a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : (a.name < b.name ? -1 : 1)))
      .map(clone);
  }
}

interface MilestoneRow {
  id: string; tenant_id: string; project_id: string; schedule_id: string;
  name: string; target_date: Date | string; owner_id: string | null;
  achieved_on: Date | string | null; achieved_by: string | null;
  achieved_note: string | null; achieved_at: Date | string | null;
  created_by: string | null; created_at: Date | string; updated_at: Date | string;
  gating_task_ids: string[] | null;
}

const day = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const stamp = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : String(value);

const toMilestone = (row: MilestoneRow): ProjectMilestone => ({
  id: row.id,
  tenantId: row.tenant_id,
  projectId: row.project_id,
  scheduleId: row.schedule_id,
  name: row.name,
  targetDate: day(row.target_date)!,
  ownerId: row.owner_id,
  gatingTaskIds: row.gating_task_ids ?? [],
  achievedOn: day(row.achieved_on),
  achievedBy: row.achieved_by,
  achievedNote: row.achieved_note,
  achievedAt: stamp(row.achieved_at),
  createdBy: row.created_by,
  createdAt: stamp(row.created_at)!,
  updatedAt: stamp(row.updated_at)!,
});

const SELECT = `
  SELECT m.id, m.tenant_id, m.project_id, m.schedule_id, m.name, m.target_date, m.owner_id,
         m.achieved_on, m.achieved_by, m.achieved_note, m.achieved_at,
         m.created_by, m.created_at, m.updated_at,
         COALESCE(
           (SELECT array_agg(g.task_id::text ORDER BY g.created_at, g.task_id)
              FROM public.aura_projects_milestone_gates g
             WHERE g.milestone_id = m.id),
           ARRAY[]::text[]
         ) AS gating_task_ids
    FROM public.aura_projects_milestones m`;

export class PostgresMilestoneStore implements MilestoneStore {
  constructor(private readonly pool: Pool) {}

  /**
   * The milestone and its gates in ONE transaction.
   *
   * A milestone that landed without its gates would read UNKNOWN — "nothing gates this" — which is
   * a true sentence about a false state, and the most misleading kind of half-written record.
   */
  async create(milestone: ProjectMilestone): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO public.aura_projects_milestones
           (id, tenant_id, project_id, schedule_id, name, target_date, owner_id,
            achieved_on, achieved_by, achieved_note, achieved_at, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [milestone.id, milestone.tenantId, milestone.projectId, milestone.scheduleId,
         milestone.name, milestone.targetDate, milestone.ownerId,
         milestone.achievedOn, milestone.achievedBy, milestone.achievedNote, milestone.achievedAt,
         milestone.createdBy, milestone.createdAt, milestone.updatedAt],
      );
      await this.writeGates(client, milestone);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(milestone: ProjectMilestone): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE public.aura_projects_milestones
            SET name = $3, target_date = $4, owner_id = $5,
                achieved_on = $6, achieved_by = $7, achieved_note = $8, achieved_at = $9,
                updated_at = $10
          WHERE id = $1 AND tenant_id = $2`,
        [milestone.id, milestone.tenantId, milestone.name, milestone.targetDate, milestone.ownerId,
         milestone.achievedOn, milestone.achievedBy, milestone.achievedNote, milestone.achievedAt,
         milestone.updatedAt],
      );
      await client.query(
        `DELETE FROM public.aura_projects_milestone_gates WHERE milestone_id = $1 AND tenant_id = $2`,
        [milestone.id, milestone.tenantId],
      );
      await this.writeGates(client, milestone);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async writeGates(
    client: { query: (text: string, values: unknown[]) => Promise<unknown> },
    milestone: ProjectMilestone,
  ): Promise<void> {
    for (const taskId of milestone.gatingTaskIds) {
      // The composite foreign key is what refuses an activity from another project's programme —
      // the database decides, rather than the caller being trusted to have checked.
      await client.query(
        `INSERT INTO public.aura_projects_milestone_gates
           (id, tenant_id, project_id, schedule_id, milestone_id, task_id)
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5)
         ON CONFLICT (milestone_id, task_id) DO NOTHING`,
        [milestone.tenantId, milestone.projectId, milestone.scheduleId, milestone.id, taskId],
      );
    }
  }

  async get(id: Id): Promise<ProjectMilestone | null> {
    const { rows } = await this.pool.query<MilestoneRow>(`${SELECT} WHERE m.id = $1`, [id]);
    return rows[0] ? toMilestone(rows[0]) : null;
  }

  async remove(tenantId: Id, id: Id): Promise<void> {
    // The gates go with it: migration 0328 cascades them from the milestone.
    await this.pool.query(
      'DELETE FROM public.aura_projects_milestones WHERE id = $1 AND tenant_id = $2', [id, tenantId],
    );
  }

  async list(filter: MilestoneFilter): Promise<ProjectMilestone[]> {
    const values: unknown[] = [filter.tenantId];
    let where = 'WHERE m.tenant_id = $1';
    if (filter.projectId) { values.push(filter.projectId); where += ` AND m.project_id = $${values.length}`; }
    if (filter.ownerId) { values.push(filter.ownerId); where += ` AND m.owner_id = $${values.length}`; }
    const { rows } = await this.pool.query<MilestoneRow>(
      `${SELECT} ${where} ORDER BY m.target_date, m.name`, values,
    );
    return rows.map(toMilestone);
  }
}
