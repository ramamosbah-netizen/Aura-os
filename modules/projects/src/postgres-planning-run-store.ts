import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type { PlanningRun, PlanningRunStatus, SolverProposal } from './domain/planning-run';
import type { AcceptedPlan } from './domain/planning-acceptance';
import type { PlanningRunStore } from './planning-run-store';

/**
 * §22 Step 9/10 (part 2) — Postgres persistence for planning runs.
 *
 * The proposal is stored as one JSONB document (see migration 0289): it is a computed snapshot read
 * back whole, never queried field by field. `create`/`get`/`listForSchedule`/`update` cover the run
 * lifecycle; `persistAcceptedPlan` is the cross-aggregate promotion (Step 10), kept as a function
 * because it writes the schedule's task rows as well as the run, in one transaction.
 */

interface Row {
  id: string; tenant_id: string; project_id: string; schedule_id: string;
  ran_at: Date | string; ran_by: string | null; status: string;
  proposal: SolverProposal; // pg parses jsonb into an object
  accepted_at: Date | string | null; accepted_by: string | null;
  acceptance_reason: string | null; discarded_reason: string | null;
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

const rowToRun = (r: Row): PlanningRun => ({
  id: r.id,
  tenantId: r.tenant_id,
  projectId: r.project_id,
  scheduleId: r.schedule_id,
  ranAt: iso(r.ran_at),
  ranBy: r.ran_by,
  status: r.status as PlanningRunStatus,
  proposal: r.proposal,
  acceptedAt: r.accepted_at ? iso(r.accepted_at) : null,
  acceptedBy: r.accepted_by,
  acceptanceReason: r.acceptance_reason,
  discardedReason: r.discarded_reason,
});

const COLS =
  'id, tenant_id, project_id, schedule_id, ran_at, ran_by, status, proposal, accepted_at, accepted_by, acceptance_reason, discarded_reason';

export class PostgresPlanningRunStore implements PlanningRunStore {
  constructor(private readonly pool: Pool) {}

  async create(run: PlanningRun): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_projects_planning_runs
         (id, tenant_id, project_id, schedule_id, ran_at, ran_by, status, proposal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [run.id, run.tenantId, run.projectId, run.scheduleId, run.ranAt, run.ranBy, run.status, JSON.stringify(run.proposal)],
    );
  }

  async get(id: Id): Promise<PlanningRun | null> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_planning_runs WHERE id = $1`,
      [id],
    );
    return res.rows.length ? rowToRun(res.rows[0]) : null;
  }

  async listForSchedule(tenantId: Id, scheduleId: Id): Promise<PlanningRun[]> {
    const res = await this.pool.query<Row>(
      `SELECT ${COLS} FROM public.aura_projects_planning_runs
        WHERE tenant_id = $1 AND schedule_id = $2 ORDER BY ran_at DESC`,
      [tenantId, scheduleId],
    );
    return res.rows.map(rowToRun);
  }

  async update(run: PlanningRun): Promise<void> {
    await this.pool.query(
      `UPDATE public.aura_projects_planning_runs
          SET status = $2, accepted_at = $3, accepted_by = $4, acceptance_reason = $5, discarded_reason = $6
        WHERE id = $1`,
      [run.id, run.status, run.acceptedAt ?? null, run.acceptedBy ?? null, run.acceptanceReason ?? null, run.discardedReason ?? null],
    );
  }
}

/**
 * §22 Step 10 (part 2) — promote an accepted plan, atomically.
 *
 * One transaction writes both halves of acceptance: the schedule's task rows get the proposed dates
 * (UPDATED in place — never the delete-and-reinsert of a save, so AURA-PM-004's churn is not on this
 * path and no booking reference is disturbed), and the run row is marked accepted. Every other
 * outstanding proposal for the schedule is superseded in the same transaction — acceptance chose one,
 * and the rest are no longer candidates. Only `planned_*` moves; `baseline_*` and actuals are left
 * exactly as they were, which is the whole point of a separately-governed baseline.
 *
 * `accepted` is the domain result of `acceptProposal`, which has already validated the transition; the
 * `run.acceptedAt`/`acceptedBy`/`acceptanceReason` it carries are written verbatim.
 */
export async function persistAcceptedPlan(pool: Pool, accepted: AcceptedPlan): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of accepted.schedule.tasks) {
      await client.query(
        `UPDATE public.aura_projects_schedule_tasks
            SET planned_start = $1, planned_end = $2, updated_at = now()
          WHERE id = $3 AND schedule_id = $4`,
        [t.plannedStart, t.plannedEnd, t.id, accepted.schedule.id],
      );
    }
    await client.query(
      `UPDATE public.aura_projects_planning_runs
          SET status = 'accepted', accepted_at = $2, accepted_by = $3, acceptance_reason = $4
        WHERE id = $1`,
      [accepted.run.id, accepted.run.acceptedAt ?? null, accepted.run.acceptedBy ?? null, accepted.run.acceptanceReason ?? null],
    );
    await client.query(
      `UPDATE public.aura_projects_planning_runs
          SET status = 'superseded'
        WHERE schedule_id = $1 AND status = 'proposed' AND id <> $2`,
      [accepted.run.scheduleId, accepted.run.id],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
