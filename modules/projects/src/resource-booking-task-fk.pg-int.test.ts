import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { TenantContext, TenantScopedPool } from '@aura/core';
import { makeProjectSchedule, setScheduleTasks, type ProjectSchedule } from './domain/schedule';
import { PostgresScheduleStore } from './postgres-schedule-store';

/**
 * §22 / AURA-PM-004 steps 2–3 — a booking's task reference is now enforced.
 *
 * Step 2 made `writeTasks` diff-upsert the task rows, so a surviving task keeps its ROW across an
 * edit; step 3 (migration 0290) added the composite foreign key from a booking onto that row, ON
 * DELETE RESTRICT. This proves the guarantee that address-only reference could never make:
 *   1. a task carrying a booking survives a plan edit — the booking still resolves, no churn;
 *   2. removing that task from the plan is REFUSED while the booking exists (a clear domain error);
 *   3. once the booking is gone, the task can be removed.
 *
 * Gated on AURA_PG_APP_URL (enforced aura_app) and AURA_PG_OWNER_URL (owner, seeds project + booking).
 */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const APP_URL = process.env.AURA_PG_APP_URL ?? process.env.SCHEDULE_PG_TEST_URL;
const OWNER_URL = process.env.AURA_PG_OWNER_URL ?? process.env.SCHEDULE_PG_OWNER_URL;
const run = APP_URL && OWNER_URL ? describe : describe.skip;

run('PostgresScheduleStore — booking→task foreign key (AURA-PM-004 step 3)', () => {
  let appPool: Pool;
  let ownerPool: Pool;
  let store: PostgresScheduleStore;
  const tenant = new TenantContext();
  const tenantId = `pm004fk-${Date.now()}`;
  const bound = { tenantId, companyId: null, actorId: null, correlationId: null };
  const projectId = '11111111-0000-4000-8000-0000000000fc';
  const T1 = '22222222-0000-4000-8000-0000000000f1';
  const T2 = '33333333-0000-4000-8000-0000000000f2';
  const bookingId = '44444444-0000-4000-8000-0000000000fb';
  let scheduleId: string;

  const withTenant = <T>(fn: () => Promise<T>): Promise<T> => tenant.run(bound, fn);
  const twoTasks = (): ProjectSchedule =>
    makeProjectSchedule({
      tenantId, projectId,
      tasks: [
        { id: T1, name: 'Rough-in', plannedStart: '2026-03-02', plannedEnd: '2026-03-06', durationWorkingDays: 5 },
        { id: T2, name: 'Lift', plannedStart: '2026-03-09', plannedEnd: '2026-03-09', durationWorkingDays: 1 },
      ],
    });

  beforeAll(async () => {
    appPool = new Pool({ connectionString: APP_URL });
    ownerPool = new Pool({ connectionString: OWNER_URL });
    await ownerPool.query(
      `INSERT INTO public.aura_projects_projects (id, tenant_id, title) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      [projectId, tenantId, 'PM-004 FK proof'],
    );
    store = new PostgresScheduleStore(new TenantScopedPool(appPool, tenant) as unknown as Pool);
  });

  afterAll(async () => {
    if (ownerPool) {
      await ownerPool.query('DELETE FROM public.aura_projects_resource_bookings WHERE id = $1', [bookingId]).catch(() => undefined);
      await ownerPool.query('DELETE FROM public.aura_projects_schedules WHERE id = $1', [scheduleId]).catch(() => undefined);
      await ownerPool.query('DELETE FROM public.aura_projects_projects WHERE id = $1', [projectId]).catch(() => undefined);
      await ownerPool.end();
    }
    if (appPool) await appPool.end();
  });

  it('enforces the reference: a booked task survives edits, resists removal, and frees once the booking is gone', async () => {
    const schedule = twoTasks();
    scheduleId = schedule.id;
    await withTenant(() => store.create(schedule));

    // A booking commits a crane against task T2 (seeded through the owner — the task FK is real now).
    await ownerPool.query(
      `INSERT INTO public.aura_projects_resource_bookings
         (id, tenant_id, project_id, schedule_id, task_id, resource_type, canonical_resource_id, unit, quantity,
          valid_from, valid_to, status, demand_at_commitment, committed_at)
       VALUES ($1,$2,$3,$4,$5,'asset','00000000-0000-4000-8000-0000000c7a5e','units',1,'2026-03-09','2026-03-09','held',1,now())`,
      [bookingId, tenantId, projectId, scheduleId, T2],
    );

    // (1) Edit the plan (rename T1) and save. T2's row is UPSERTED, not recreated, so the booking's
    // foreign key stays valid — the save succeeds and the booking still points at a live task.
    await withTenant(() => store.update(setScheduleTasks(schedule, [
      { id: T1, name: 'Rough-in (revised)', plannedStart: '2026-03-02', plannedEnd: '2026-03-06', durationWorkingDays: 5 },
      { id: T2, name: 'Lift', plannedStart: '2026-03-09', plannedEnd: '2026-03-09', durationWorkingDays: 1 },
    ])));
    const stillBooked = await ownerPool.query('SELECT task_id FROM public.aura_projects_resource_bookings WHERE id = $1', [bookingId]);
    expect(stillBooked.rows[0]?.task_id, 'the booking must still resolve to its task after an edit').toBe(T2);

    // (2) Removing T2 from the plan is refused while the booking references it — a clear domain error,
    // not an opaque constraint violation.
    await expect(
      withTenant(() => store.update(setScheduleTasks(schedule, [
        { id: T1, name: 'Rough-in (revised)', plannedStart: '2026-03-02', plannedEnd: '2026-03-06', durationWorkingDays: 5 },
      ]))),
    ).rejects.toThrow(/active resource booking/);

    // T2 is still there — the refused save rolled back whole.
    const kept = await withTenant(() => store.get(scheduleId));
    expect(kept!.tasks.map((t) => t.id).sort()).toEqual([T1, T2].sort());

    // (3) Remove the booking, then the task can be removed.
    await ownerPool.query('DELETE FROM public.aura_projects_resource_bookings WHERE id = $1', [bookingId]);
    await withTenant(() => store.update(setScheduleTasks(schedule, [
      { id: T1, name: 'Rough-in (revised)', plannedStart: '2026-03-02', plannedEnd: '2026-03-06', durationWorkingDays: 5 },
    ])));
    const after = await withTenant(() => store.get(scheduleId));
    expect(after!.tasks.map((t) => t.id)).toEqual([T1]);
  });
});
