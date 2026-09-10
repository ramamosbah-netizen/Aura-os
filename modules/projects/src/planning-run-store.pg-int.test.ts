import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { TenantContext, TenantScopedPool } from '@aura/core';
import type { ResourceRef } from './domain/resource-ref';
import { makeProjectSchedule, setBaseline, type ProjectSchedule } from './domain/schedule';
import { runPlanning, type PlanningRun } from './domain/planning-run';
import { acceptProposal } from './domain/planning-acceptance';
import { PostgresScheduleStore } from './postgres-schedule-store';
import { PostgresPlanningRunStore, persistAcceptedPlan } from './postgres-planning-run-store';

/**
 * §22 Step 9/10 (part 2) — planning-run persistence and governed acceptance, against real PostgreSQL.
 *
 * Step 9: a run persists and its proposal round-trips, and persisting it changes NO schedule date.
 * Step 10: acceptance moves planned_* and leaves baseline_* untouched, marks the run accepted, and
 * supersedes the schedule's other outstanding proposals — all under the enforced aura_app role.
 *
 * Gated on AURA_PG_APP_URL (aura_app) and AURA_PG_OWNER_URL (owner, which seeds the fixture project).
 */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const APP_URL = process.env.AURA_PG_APP_URL;
const OWNER_URL = process.env.AURA_PG_OWNER_URL;
const run = APP_URL && OWNER_URL ? describe : describe.skip;

run('Planning run persistence + acceptance (§22 Step 9/10 pt2)', () => {
  let appPool: Pool;
  let ownerPool: Pool;
  let scoped: TenantScopedPool;
  let scheduleStore: PostgresScheduleStore;
  let runStore: PostgresPlanningRunStore;
  const tenant = new TenantContext();
  const tenantId = `s22s9-${Date.now()}`;
  const bound = { tenantId, companyId: null, actorId: null, correlationId: null };
  const projectId = '11111111-0000-4000-8000-00000000090a';
  const CRANE: ResourceRef = { resourceType: 'asset', canonicalResourceId: '00000000-0000-4000-8000-00000000c9a5' };
  const T1 = 'aaaaaaaa-0000-4000-8000-0000000009a1';
  const T2 = 'bbbbbbbb-0000-4000-8000-0000000009a2';
  const START = '2026-03-09';
  const facts = { capacities: [{ resource: CRANE, unit: 'units' as const, quantity: 1 }], projectStart: START };
  let schedule: ProjectSchedule;

  const withTenant = <T>(fn: () => Promise<T>): Promise<T> => tenant.run(bound, fn);

  beforeAll(async () => {
    appPool = new Pool({ connectionString: APP_URL });
    ownerPool = new Pool({ connectionString: OWNER_URL });
    await ownerPool.query(
      `INSERT INTO public.aura_projects_projects (id, tenant_id, title) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`,
      [projectId, tenantId, 'S9/S10 proof'],
    );
    scoped = new TenantScopedPool(appPool, tenant);
    scheduleStore = new PostgresScheduleStore(scoped as unknown as Pool);
    runStore = new PostgresPlanningRunStore(scoped as unknown as Pool);

    // A schedule of two tasks contending for one crane, baselined at the authored dates.
    schedule = setBaseline(
      makeProjectSchedule({
        tenantId, projectId,
        tasks: [
          { id: T1, name: 'Lift A', plannedStart: START, plannedEnd: START, durationWorkingDays: 1, requirements: [{ resource: CRANE, quantity: 1, unit: 'units' }] },
          { id: T2, name: 'Lift B', plannedStart: START, plannedEnd: START, durationWorkingDays: 1, requirements: [{ resource: CRANE, quantity: 1, unit: 'units' }] },
        ],
      }),
    );
    await withTenant(() => scheduleStore.create(schedule));
  });

  afterAll(async () => {
    if (ownerPool) {
      await ownerPool.query('DELETE FROM public.aura_projects_planning_runs WHERE schedule_id = $1', [schedule?.id]).catch(() => undefined);
      await ownerPool.query('DELETE FROM public.aura_projects_schedules WHERE id = $1', [schedule?.id]).catch(() => undefined);
      await ownerPool.query('DELETE FROM public.aura_projects_projects WHERE id = $1', [projectId]).catch(() => undefined);
      await ownerPool.end();
    }
    if (appPool) await appPool.end();
  });

  it('Step 9: persists a run whose proposal round-trips, and changes no schedule date', async () => {
    await withTenant(async () => {
      const run = runPlanning(schedule, facts, { ranBy: 'planner' });
      // The proposal moved T2 forward a working day; T1 stayed.
      expect(run.proposal.placements.find((p) => p.taskId === T2)!.start).toBe('2026-03-10');
      await runStore.create(run);

      const back = await runStore.get(run.id);
      expect(back?.status).toBe('proposed');
      expect(back?.proposal).toEqual(run.proposal); // JSONB round-trip, verdicts and placements intact

      // Persisting the run touched no schedule date — the current plan is still the authored one.
      const sched = await scheduleStore.get(schedule.id);
      expect(sched?.tasks.find((t) => t.id === T2)!.plannedStart).toBe(START);
    });
  });

  it('Step 10: acceptance moves planned dates, leaves baseline untouched, and supersedes siblings', async () => {
    await withTenant(async () => {
      const runA = runPlanning(schedule, facts, { ranBy: 'planner' });
      const runB = runPlanning(schedule, facts, { ranBy: 'planner' }); // a second outstanding proposal
      await runStore.create(runA);
      await runStore.create(runB);

      const accepted = acceptProposal(schedule, runA, { acceptedBy: 'pm-1' });
      await persistAcceptedPlan(scoped as unknown as Pool, accepted);

      const sched = await scheduleStore.get(schedule.id);
      const t2 = sched!.tasks.find((t) => t.id === T2)!;
      expect(t2.plannedStart).toBe('2026-03-10'); // current plan promoted
      expect(t2.baselineStart).toBe(START);       // baseline deliberately untouched

      expect((await runStore.get(runA.id))!.status).toBe('accepted');
      expect((await runStore.get(runB.id))!.status).toBe('superseded');
    });
  });
});
