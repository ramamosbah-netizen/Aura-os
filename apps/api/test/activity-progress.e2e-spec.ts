// AURA OS — PLN-12: where an activity's progress actually comes from, over HTTP.
//
// A Gantt bar at 75% is not one fact. It is one of three, and this spec exists to prove the three
// cannot wear each other's clothes anywhere along the real chain:
//
//   installed quantity → Quantity Ledger → WBS node progress → activity progress
//
// What is proven here, and why each matters:
//   · a measured activity reports the LEDGER's figure, not the number typed on the plan;
//   · saving a plan cannot overwrite that figure, mint a statement against it, or drop one;
//   · stating something different costs a reason, a name and its own permission;
//   · withdrawing the statement hands the number back to the measurement;
//   · more installation moves the reported progress with nobody touching the plan at all.
//
// Nothing here is stored twice: `progress` is DERIVED on every read. A copy on the activity would
// be correct as of the last refresh, which is the same defect as a stored feasibility verdict.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import { QuantityLedgerService } from '@aura/projects';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { createGovernedDeliveryFixture, until } from './helpers/governed-delivery-fixture';

const TENANT = `progress-tenant-${Date.now()}`;

/** Only what this spec reads back; a saved activity carries more than this. */
interface PlanActivity {
  id: string;
  wbsNodeId: string | null;
  name: string;
  plannedStart: string;
  plannedEnd: string;
  percentComplete: number;
}

interface ResolvedProgress {
  effective: number | null;
  source: 'evidence' | 'override' | 'declared';
  evidence: number | null;
  override: { value: number; reason: string; at: string; by: string | null } | null;
}

describe('activity progress — measured, stated, or merely declared (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;
  let measuredTaskId: string;
  let declaredTaskId: string;
  let boqItemId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);
    // The fixture's governed award needs a maker and an independent checker; `qty-*` because the
    // fixture names them when it approves on the second pair of eyes.
    for (const userId of ['qty-maker', 'qty-checker']) {
      access.grant({ userId, roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 1_000_000 });
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }
    app.use((req: { headers?: Record<string, string> }, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: TENANT, companyId: null, actorId: req.headers?.['x-e2e-actor'] ?? 'qty-maker', correlationId: 'e2e-progress' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());

    // The governed chain: tender → award → contract → project, with the frozen award item that
    // makes "installed against WHAT" answerable, and a work package mapped to it.
    const fixture = await createGovernedDeliveryFixture(http, app.get(QuantityLedgerService), 'Riser', 200, 'm2', TENANT);
    projectId = fixture.project.id;
    boqItemId = fixture.boqItemId;

    // A second work package in the same project with NO delivery item mapped to it. Nothing will
    // ever be measured against this one, which is what makes its activity's number a declaration.
    const unmeasured = (await http.post('/api/v1/projects/wbs').send({
      projectId, code: '2.Riser', title: 'Riser commissioning', plannedValue: 40_000,
    }).expect(201)).body;

    const plan = (await http.post('/api/v1/projects/schedules').send({
      projectId,
      projectName: fixture.project.name ?? 'Riser',
      tasks: [
        { wbsNodeId: fixture.wbs.id, name: 'Install riser containment', plannedStart: '2026-09-01', plannedEnd: '2026-09-30' },
        { wbsNodeId: unmeasured.id, name: 'Commission riser', plannedStart: '2026-10-01', plannedEnd: '2026-10-15' },
      ],
    }).expect(201)).body;
    measuredTaskId = plan.tasks[0].id;
    declaredTaskId = plan.tasks[1].id;
  });

  afterAll(async () => { await app?.close(); });

  const readPlan = async () => {
    const plans = (await http.get('/api/v1/projects/schedules').expect(200)).body as Array<{
      projectId: string; tasks: PlanActivity[]; progress: Record<string, ResolvedProgress>;
    }>;
    const plan = plans.find((candidate) => candidate.projectId === projectId);
    if (!plan) throw new Error('the project under test has no schedule');
    return plan;
  };
  const progressOf = async (taskId: string) => (await readPlan()).progress[taskId];
  /** Re-save the plan exactly as it was read, with a patch applied to one activity. */
  const resaveWith = async (taskId: string, patch: Record<string, unknown>) => {
    const plan = await readPlan();
    return http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: plan.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    }).expect(201);
  };

  it('calls an unmeasured zero a MEASUREMENT of zero, and a typed number a DECLARATION', async () => {
    // Both activities read 0 right now. They do not mean the same thing, and the source says so:
    // the ledger can answer for the first (0 of 200 m² installed); nothing can answer for the
    // second, so whatever the plan holds is somebody's statement and is labelled as one.
    expect(await progressOf(measuredTaskId)).toMatchObject({ effective: 0, source: 'evidence', evidence: 0, override: null });
    expect(await progressOf(declaredTaskId)).toMatchObject({ effective: 0, source: 'declared', evidence: null, override: null });
  });

  it('narrows to one project when asked, so a reader taking the first row reads the right plan', async () => {
    const mine = (await http.get(`/api/v1/projects/schedules?projectId=${projectId}`).expect(200)).body as Array<{ projectId: string }>;
    expect(mine).toHaveLength(1);
    expect(mine[0].projectId).toBe(projectId);
    // Not "everything" — a filter that silently falls back to the whole tenant is how a project
    // surface ends up displaying another project's activities.
    expect((await http.get('/api/v1/projects/schedules?projectId=no-such-project').expect(200)).body).toEqual([]);
  });

  it('moves the reported progress when work is installed — through the ledger, not the plan', async () => {
    await http.post('/api/v1/site/installations')
      .send({ projectId, boqItemId, date: '2026-09-05', description: 'Riser L1-L3', quantity: 150, unit: 'm2' }).expect(201);

    // 150 of 200 m² = 75%, reached without anybody opening the programme.
    const progress = await until(async () => {
      const current = await progressOf(measuredTaskId);
      return current.effective === 75 ? current : null;
    });
    expect(progress).toMatchObject({ effective: 75, source: 'evidence', evidence: 75 });
  });

  it('will not let a plan save overwrite what was measured', async () => {
    // The planner types 10% over a measured 75%. The plan keeps the typed number as its declared
    // field — but what the programme REPORTS is still the measurement, because a save is not a
    // statement against the evidence.
    await resaveWith(measuredTaskId, { percentComplete: 10 });
    expect(await progressOf(measuredTaskId)).toMatchObject({ effective: 75, source: 'evidence', evidence: 75 });

    // Where nothing is measured, the same edit is exactly what it looks like, and is honoured.
    await resaveWith(declaredTaskId, { percentComplete: 40 });
    expect(await progressOf(declaredTaskId)).toMatchObject({ effective: 40, source: 'declared', evidence: null });
  });

  it('refuses a statement with no reason, and a statement with nothing to contradict', async () => {
    await http.post(`/api/v1/projects/schedules/${projectId}/activities/${measuredTaskId}/progress`)
      .send({ value: 90 }).expect(400);
    await http.post(`/api/v1/projects/schedules/${projectId}/activities/${measuredTaskId}/progress`)
      .send({ value: 90, reason: '   ' }).expect(400);

    // Not an override — a declaration wearing a signature it did not earn.
    const refused = await http.post(`/api/v1/projects/schedules/${projectId}/activities/${declaredTaskId}/progress`)
      .send({ value: 90, reason: 'ahead of the survey' }).expect(400);
    expect(refused.body.message).toMatch(/nothing to override/);
    expect(await progressOf(declaredTaskId)).toMatchObject({ source: 'declared' });
  });

  it('lets a stated figure stand over the measurement, with both numbers and a name kept visible', async () => {
    const stated = await http.post(`/api/v1/projects/schedules/${projectId}/activities/${measuredTaskId}/progress`)
      .send({ value: 90, reason: 'riser complete on site, awaiting joint measure' }).expect(201);
    expect(stated.body.progress).toMatchObject({ effective: 90, source: 'override', evidence: 75 });

    const progress = await progressOf(measuredTaskId);
    expect(progress).toMatchObject({ effective: 90, source: 'override', evidence: 75 });
    // The measurement is not replaced or erased — it sits beside the claim, which is what makes
    // the disagreement nameable rather than invisible.
    expect(progress.override).toMatchObject({ value: 90, reason: 'riser complete on site, awaiting joint measure', by: 'qty-maker' });
    expect(Date.parse(progress.override!.at)).not.toBeNaN();
  });

  it('cannot have a statement minted or dropped by saving the plan', async () => {
    // Minted: the payload claims an override on the DECLARED activity, complete with reason and
    // timestamp. Saving a plan does not hold the permission, so the payload is ignored outright.
    await resaveWith(declaredTaskId, {
      progressOverride: 95, progressOverrideReason: 'forged through the plan', progressOverrideAt: new Date().toISOString(), progressOverrideBy: 'planner',
    });
    expect(await progressOf(declaredTaskId)).toMatchObject({ source: 'declared', effective: 40, override: null });

    // Dropped: a save that omits the fields entirely — an older client, or a caller that simply
    // does not know about them — must not quietly withdraw somebody's statement.
    const plan = await readPlan();
    await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: plan.tasks.map(({ id, wbsNodeId, name, plannedStart, plannedEnd, percentComplete }) => ({ id, wbsNodeId, name, plannedStart, plannedEnd, percentComplete })),
    }).expect(201);
    expect(await progressOf(measuredTaskId)).toMatchObject({ source: 'override', effective: 90, evidence: 75 });
  });

  it('hands the number back to the measurement when the statement is withdrawn', async () => {
    const withdrawn = await http.post(`/api/v1/projects/schedules/${projectId}/activities/${measuredTaskId}/progress`)
      .send({ value: null }).expect(201);
    expect(withdrawn.body.progress).toMatchObject({ effective: 75, source: 'evidence', override: null });

    const again = await http.post(`/api/v1/projects/schedules/${projectId}/activities/${measuredTaskId}/progress`)
      .send({ value: null }).expect(400);
    expect(again.body.message).toMatch(/nothing to withdraw/);
  });

  it('keeps moving with the site once the statement is gone, with nobody touching the programme', async () => {
    await http.post('/api/v1/site/installations')
      .send({ projectId, boqItemId, date: '2026-09-20', description: 'Riser L4-L5', quantity: 50, unit: 'm2' }).expect(201);

    const progress = await until(async () => {
      const current = await progressOf(measuredTaskId);
      return current.effective === 100 ? current : null;
    });
    expect(progress).toMatchObject({ effective: 100, source: 'evidence', evidence: 100 });
    // …while the activity's own stored number is still the 10% typed into the plan long ago. That
    // it never had to be corrected is the point: it was never the authority.
    expect((await readPlan()).tasks.find((task) => task.id === measuredTaskId)).toMatchObject({ percentComplete: 10 });
  });
});

/**
 * Who may say it — proven with the guard actually enforcing.
 *
 * Separate application, because the chain above runs with auth OFF (the dev default: no verifier,
 * so the permission guard passes through by design and the actor arrives from a header). That is
 * the right shape for proving what the NUMBER does; it cannot prove what a PERSON may do. Here a
 * verifier exists, every request carries a real token, and the guard is live.
 *
 * The claim under test is the one the route's comment makes: authoring a programme and claiming
 * progress the site has not measured are different acts. Same person, same plan — they may write
 * it, and they may not state progress against the measurement on it.
 */
describe('the permission a progress statement costs (JWT ON)', () => {
  let app: INestApplication;
  let planner: ReturnType<typeof request.agent>;
  let manager: ReturnType<typeof request.agent>;
  let projectId: string;
  let taskId: string;
  const AUTH_TENANT = `progress-auth-${Date.now()}`;

  beforeAll(async () => {
    // Set before the container is built: AuthService reads the secret in a field initialiser, and
    // `enabled` is simply whether one was found.
    process.env.AUTH_JWT_SECRET = 'activity-progress-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    // A real Planning Engineer's working set, minus the one permission under test. Bespoke rather
    // than `r-planning-engineer` so the only variable here is that permission; that the shipped
    // role genuinely lacks it — and that the Project Manager holds it — is asserted over the role
    // catalogue itself in src/auth/elv-roles.test.ts.
    access.registerRole({
      id: 'r-e2e-planner', name: 'Planner (e2e)',
      permissions: ['projects.schedule.read', 'projects.schedule.create', 'projects.schedule.plan', 'projects.wb.read'],
    });
    access.grant({ userId: 'planner', roleId: 'r-e2e-planner', scope: { kind: 'org', level: 'tenant', id: AUTH_TENANT } });
    access.grant({ userId: 'manager', roleId: 'r-pm', scope: { kind: 'org', level: 'tenant', id: AUTH_TENANT } });
    for (const userId of ['planner', 'manager']) users.save({ tenantId: AUTH_TENANT, userId, displayName: userId, active: true });

    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    expect(auth.enabled).toBe(true);

    const server = app.getHttpServer();
    planner = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'planner', tenantId: AUTH_TENANT })}`);
    manager = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'manager', tenantId: AUTH_TENANT })}`);

    projectId = (await manager.post('/api/v1/projects/projects').send({ title: 'Guarded programme' }).expect(201)).body.id;
    const node = (await manager.post('/api/v1/projects/wbs').send({ projectId, code: '1.G', title: 'Guarded package', plannedValue: 10_000 }).expect(201)).body;
    taskId = (await manager.post('/api/v1/projects/schedules').send({
      projectId, tasks: [{ wbsNodeId: node.id, name: 'Guarded activity', plannedStart: '2026-09-01', plannedEnd: '2026-09-30' }],
    }).expect(201)).body.tasks[0].id;
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  it('lets the planner author the programme', async () => {
    // Establishes that the refusal below is about ONE permission, not about being shut out of
    // planning: this is the same person writing the same plan.
    const saved = await planner.post('/api/v1/projects/schedules').send({
      projectId, tasks: [{ id: taskId, name: 'Guarded activity', plannedStart: '2026-09-02', plannedEnd: '2026-10-02' }],
    }).expect(201);
    expect(saved.body.tasks[0]).toMatchObject({ id: taskId, plannedEnd: '2026-10-02' });
  });

  it('refuses that same planner a progress statement', async () => {
    await planner.post(`/api/v1/projects/schedules/${projectId}/activities/${taskId}/progress`)
      .send({ value: 90, reason: 'site says it is further along' }).expect(403);
  });

  it('lets the project manager through the guard, where the rule itself answers', async () => {
    // Past the guard and refused on the merits — nothing is measured against this activity, so
    // there is no measurement to state a figure against. The two refusals are different facts and
    // the status codes keep them apart.
    const refused = await manager.post(`/api/v1/projects/schedules/${projectId}/activities/${taskId}/progress`)
      .send({ value: 90, reason: 'site says it is further along' }).expect(400);
    expect(refused.body.message).toMatch(/nothing to override/);
  });
});
