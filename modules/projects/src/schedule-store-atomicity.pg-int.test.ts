import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { TenantContext, TenantScopedPool } from '@aura/core';
import { PostgresScheduleStore } from './postgres-schedule-store';
import {
  makeProjectSchedule,
  setScheduleDependencies,
  type ProjectSchedule,
} from './domain/schedule';
import type { ScheduleDependency } from './domain/schedule-network';

/**
 * AURA-PM-004 — end-to-end proof that a failed schedule save loses nothing.
 *
 * The unit test (`postgres-schedule-store.test.ts`) pins the transaction boundary against a fake
 * pool. This one proves the outcome that boundary exists for, against real PostgreSQL: a save that
 * fails part way through — after `writeTasks` has already DELETEd the task rows — leaves the schedule
 * with exactly the tasks it had, not zero.
 *
 * Gated, and gated on the ENFORCED application role. §22's proofs run as a NOSUPERUSER/NOBYPASSRLS
 * actor because a superuser silently bypasses RLS and would give false comfort. Point
 * SCHEDULE_PG_TEST_URL at that role (e.g. the local disposable database's `aura_app`), with the
 * schedule migrations applied.
 */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
// AURA_PG_APP_URL / AURA_PG_OWNER_URL is the shared pg-int convention; SCHEDULE_PG_* remains as a
// fallback so this proof's original run command still works.
const URL = process.env.AURA_PG_APP_URL ?? process.env.SCHEDULE_PG_TEST_URL;
// The task RLS policy requires a real aura_projects_projects row for the schedule's project, so the
// fixture project is seeded through the OWNER role (which bypasses RLS).
const OWNER_URL = process.env.AURA_PG_OWNER_URL ?? process.env.SCHEDULE_PG_OWNER_URL;
const run = URL && OWNER_URL ? describe : describe.skip;

run('PostgresScheduleStore — a failed save preserves the prior tasks (AURA-PM-004)', () => {
  let rawPool: Pool;
  let ownerPool: Pool;
  let store: PostgresScheduleStore;
  const tenant = new TenantContext();
  const tenantId = `pm004-${Date.now()}`;
  const boundInfo = { tenantId, companyId: null, actorId: null, correlationId: null };
  const projectId = '11111111-0000-4000-8000-0000000000aa';
  const taskRoughIn = '22222222-0000-4000-8000-0000000000bb';
  const taskPullCables = '33333333-0000-4000-8000-0000000000cc';
  let scheduleId: string;

  beforeAll(async () => {
    rawPool = new Pool({ connectionString: URL });
    const probe = await rawPool.connect();
    const role = await probe.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT current_user AS rolname, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
    );
    probe.release();
    const current = role.rows[0];
    expect(current, 'SCHEDULE_PG_TEST_URL must resolve to a database role').toBeTruthy();
    expect(current.rolsuper, `role ${current.rolname} must not be superuser`).toBe(false);
    expect(current.rolbypassrls, `role ${current.rolname} must not bypass RLS`).toBe(false);

    // Seed the fixture project through the owner role — the task RLS policy requires it to exist.
    ownerPool = new Pool({ connectionString: OWNER_URL });
    await ownerPool.query(
      `INSERT INTO public.aura_projects_projects (id, tenant_id, title) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [projectId, tenantId, 'PM-004 live proof'],
    );

    store = new PostgresScheduleStore(new TenantScopedPool(rawPool, tenant) as unknown as Pool);
  });

  afterAll(async () => {
    // Clean up through the owner: the schedule cascades to tasks/requirements/dependencies, then the project.
    if (ownerPool) {
      await ownerPool.query('DELETE FROM public.aura_projects_schedules WHERE id = $1', [scheduleId]).catch(() => undefined);
      await ownerPool.query('DELETE FROM public.aura_projects_projects WHERE id = $1', [projectId]).catch(() => undefined);
      await ownerPool.end();
    }
    if (rawPool) await rawPool.end();
  });

  it('rolls back a save whose dependency insert violates the task FK, keeping every task', async () => {
    await tenant.run(boundInfo, async () => {
      // A valid schedule: two tasks, a requirement, and one finish-to-start edge between them.
      const created = setScheduleDependencies(
        makeProjectSchedule({
          tenantId,
          projectId,
          projectName: 'PM-004 live proof',
          tasks: [
            { id: taskRoughIn, name: 'Rough-in', plannedStart: '2026-03-02', plannedEnd: '2026-03-06' },
            {
              id: taskPullCables,
              name: 'Pull cables',
              plannedStart: '2026-03-09',
              plannedEnd: '2026-03-13',
              requirements: [
                { resource: { resourceType: 'pool', canonicalResourceId: '44444444-0000-4000-8000-0000000000dd' }, quantity: 4, unit: 'persons' },
              ],
            },
          ],
        }),
        [{ predecessorTaskId: taskRoughIn, successorTaskId: taskPullCables }],
      );
      scheduleId = created.id;
      await store.create(created);

      const before = await store.get(scheduleId);
      expect(before?.tasks.map((t) => t.id).sort()).toEqual([taskRoughIn, taskPullCables].sort());
      expect(before?.dependencies).toHaveLength(1);

      // A malformed edit: an edge pointing at a task id that is not in the schedule. writeTasks
      // DELETEs the task rows, re-inserts the two tasks, then this dependency INSERT trips the
      // successor foreign key. Without the transaction, the DELETE would already have committed.
      const danglingEdge: ScheduleDependency = {
        id: '55555555-0000-4000-8000-0000000000ee',
        tenantId,
        projectId,
        scheduleId,
        predecessorTaskId: taskRoughIn,
        successorTaskId: '99999999-0000-4000-8000-0000000000ff', // no such task
      };
      const badUpdate: ProjectSchedule = { ...before!, dependencies: [...before!.dependencies, danglingEdge] };

      await expect(store.update(badUpdate)).rejects.toThrow();

      // The save failed whole. The schedule still has both tasks, its requirement and its one edge —
      // nothing was destroyed by the DELETE that the failed transaction rolled back.
      const after = await store.get(scheduleId);
      expect(after?.tasks.map((t) => t.id).sort()).toEqual([taskRoughIn, taskPullCables].sort());
      expect(after?.tasks.find((t) => t.id === taskPullCables)?.requirements).toHaveLength(1);
      expect(after?.dependencies).toHaveLength(1);
    });
  });
});
