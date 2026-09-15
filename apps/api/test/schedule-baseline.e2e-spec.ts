// AURA OS — PLN-05: locking a baseline, and what it costs to replace one, over HTTP.
//
// A baseline is what every variance figure on a project is measured against: a delay's assessed
// impact, what a recovery recovered, an SPI. That makes it the single most consequential thing on a
// programme to overwrite — and it was overwritten silently. `setBaseline` copied today's dates onto
// every task and stamped a timestamp: no record of who, no reason, and the previous baseline gone.
//
// Accept a recovery, re-baseline, and every delay ever assessed against the old dates is now
// measured against the new ones — the variance the recovery existed to answer for, erased by the
// act of answering for it.
//
// What is proven here:
//   · taking a baseline records WHO took it and which revision it is;
//   · a later plan edit retains the original baseline, which is the point of having one;
//   · replacing a baseline is refused without a reason, and the replaced one is KEPT;
//   · a variance against the original stays computable after a re-baseline;
//   · and under a live verifier, a Planning Engineer who may author the programme may not commit
//     its baseline.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `baseline-tenant-${Date.now()}`;

interface Plan {
  id: string;
  baselineSetAt: string | null;
  baselineSetBy: string | null;
  baselineRevision: number | null;
  tasks: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string; baselineStart: string | null; baselineEnd: string | null }>;
}
interface Baseline {
  revision: number;
  setAt: string;
  setBy: string | null;
  reason: string | null;
  tasks: Array<{ taskId: string; name: string; start: string; end: string }>;
}

describe('locking a baseline, and replacing one (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.get(AccessService).grant({ userId: 'manager', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    app.get(UsersService).save({ tenantId: TENANT, userId: 'manager', displayName: 'Manager', active: true });
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: TENANT, companyId: null, actorId: 'manager', correlationId: 'e2e-baseline' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());

    projectId = (await http.post('/api/v1/projects/projects').send({ title: 'Baseline project' }).expect(201)).body.id;
    const node = (await http.post('/api/v1/projects/wbs').send({
      projectId, code: '1.1', title: 'Containment', plannedValue: 10_000,
    }).expect(201)).body.id;
    await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: [{ wbsNodeId: node, name: 'Containment', plannedStart: '2026-03-09', plannedEnd: '2026-03-12' }],
    }).expect(201);
  });

  afterAll(async () => { await app?.close(); });

  const planOf = async () => (await http.get(`/api/v1/projects/schedules?projectId=${projectId}`).expect(200)).body[0] as Plan;
  const historyOf = async () =>
    (await http.get(`/api/v1/projects/schedules/${projectId}/baselines`).expect(200)).body as Baseline[];
  const baseline = (reason?: string) =>
    http.post(`/api/v1/projects/schedules/${projectId}/baseline`).send(reason ? { reason } : {});

  it('locks a dated baseline and records who took it', async () => {
    const before = await planOf();
    expect(before.baselineSetAt).toBeNull();

    await baseline().expect(201);
    const after = await planOf();
    expect(after).toMatchObject({ baselineSetBy: 'manager', baselineRevision: 0 });
    expect(Date.parse(after.baselineSetAt!)).not.toBeNaN();
    expect(after.tasks[0]).toMatchObject({ baselineStart: '2026-03-09', baselineEnd: '2026-03-12' });

    const history = await historyOf();
    expect(history).toHaveLength(1);
    // The first baseline needs no justification — there is nothing being replaced.
    expect(history[0]).toMatchObject({ revision: 0, setBy: 'manager', reason: null });
    expect(history[0].tasks[0]).toMatchObject({ name: 'Containment', start: '2026-03-09', end: '2026-03-12' });
  });

  it('retains the original baseline through a later change — the point of having one', async () => {
    const plan = await planOf();
    await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: plan.tasks.map((task) => ({ id: task.id, name: task.name, plannedStart: '2026-03-16', plannedEnd: '2026-03-19' })),
    }).expect(201);

    const slipped = await planOf();
    expect(slipped.tasks[0]).toMatchObject({
      plannedStart: '2026-03-16', plannedEnd: '2026-03-19',
      baselineStart: '2026-03-09', baselineEnd: '2026-03-12',
    });
    // The slippage is now visible, which is exactly what the commitment is for.
  });

  it('refuses to replace a baseline without a reason', async () => {
    const refused = await baseline();
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/requires a reason/);
    // Refused means refused: still on revision 0, still the original dates.
    const plan = await planOf();
    expect(plan.baselineRevision).toBe(0);
    expect(plan.tasks[0].baselineStart).toBe('2026-03-09');
  });

  it('adds a revision rather than destroying one, and keeps what it replaced', async () => {
    await baseline('recovery accepted after the storm').expect(201);
    const plan = await planOf();
    expect(plan).toMatchObject({ baselineRevision: 1, baselineSetBy: 'manager' });
    expect(plan.tasks[0]).toMatchObject({ baselineStart: '2026-03-16', baselineEnd: '2026-03-19' });

    const history = await historyOf();
    expect(history.map((entry) => entry.revision)).toEqual([1, 0]);
    expect(history[0]).toMatchObject({ revision: 1, reason: 'recovery accepted after the storm' });
    // THE POINT: revision 0 still says what was originally committed to, so a variance against the
    // original stays computable after the re-baseline that answered for it.
    expect(history[1].tasks[0]).toMatchObject({ start: '2026-03-09', end: '2026-03-12' });
    expect(history[1].reason).toBeNull();
  });

  it('refuses to baseline a programme with nothing in it', async () => {
    const empty = (await http.post('/api/v1/projects/projects').send({ title: 'Empty project' }).expect(201)).body.id;
    await http.post('/api/v1/projects/schedules').send({ projectId: empty, tasks: [] }).expect(201);
    const refused = await http.post(`/api/v1/projects/schedules/${empty}/baseline`).send({});
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/empty schedule/);
  });
});

/**
 * Who may commit a baseline — proven with the guard actually enforcing.
 *
 * A separate application, because the chain above runs with auth OFF, where the permission guard
 * passes through by design. The claim under test: authoring a programme and committing the
 * yardstick every variance on it is measured against are different acts.
 */
describe('who may commit a baseline (JWT ON)', () => {
  let app: INestApplication;
  let planner: ReturnType<typeof request.agent>;
  let manager: ReturnType<typeof request.agent>;
  let project: string;
  const AUTH_TENANT = `baseline-auth-${Date.now()}`;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'schedule-baseline-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    access.registerRole({
      id: 'r-e2e-baseline-planner', name: 'Planner (e2e)',
      permissions: ['projects.schedule.read', 'projects.schedule.create', 'projects.schedule.plan',
        'projects.wb.*', 'projects.project.*'],
    });
    access.grant({ userId: 'planner', roleId: 'r-e2e-baseline-planner', scope: { kind: 'org', level: 'tenant', id: AUTH_TENANT } });
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

    project = (await planner.post('/api/v1/projects/projects').send({ title: 'Guarded baseline' }).expect(201)).body.id;
    const node = (await planner.post('/api/v1/projects/wbs').send({
      projectId: project, code: '1.1', title: 'Guarded package', plannedValue: 10_000,
    }).expect(201)).body.id;
    await planner.post('/api/v1/projects/schedules').send({
      projectId: project,
      tasks: [{ wbsNodeId: node, name: 'Guarded activity', plannedStart: '2026-03-09', plannedEnd: '2026-03-12' }],
    }).expect(201);
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  it('refuses the planner the baseline, while letting them author the programme', async () => {
    // Same person, same plan: they write it, and they do not commit the yardstick it is judged by.
    await planner.post(`/api/v1/projects/schedules/${project}/baseline`).send({}).expect(403);
    const plan = (await planner.get(`/api/v1/projects/schedules?projectId=${project}`).expect(200)).body[0] as Plan;
    expect(plan.baselineSetAt).toBeNull();
  });

  it('lets the project manager commit it, and records their name on the act', async () => {
    await manager.post(`/api/v1/projects/schedules/${project}/baseline`).send({}).expect(201);
    const plan = (await planner.get(`/api/v1/projects/schedules?projectId=${project}`).expect(200)).body[0] as Plan;
    expect(plan).toMatchObject({ baselineSetBy: 'manager', baselineRevision: 0 });
    // The planner can still READ which baseline the programme is on — that is not privileged.
    await planner.get(`/api/v1/projects/schedules/${project}/baselines`).expect(200);
  });
});
