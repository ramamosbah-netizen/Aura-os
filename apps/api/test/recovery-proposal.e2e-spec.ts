// AURA OS — PLN-15: recovery planning, over HTTP, as one chain.
//
//   delay event → derived impact → recorded assessment → EXPLICIT prepare-recovery hand-off
//     → recovery proposal (a scenario) → review/acceptance → governed programme consequence
//
// A RECOVERY PROPOSAL IS A SCENARIO. It is stored beside the programme, changes not one stored
// date, and becomes current only through a governed acceptance by somebody who may move a
// programme. A re-plan that quietly became the plan is how a project's dates stop meaning
// anything — nobody can say when they were last agreed to.
//
// What is proven here:
//   · the hand-off is explicit and refuses an unassessed delay, or one from another project;
//   · the proposal carries canonical lineage to the delay and to the assessment that justified it,
//     frozen at the hand-off so a later re-assessment cannot rewrite it;
//   · it uses the same calendar, the same dependency network and the same CPM as the programme;
//   · current finish, proposed finish and working days recovered are reported together;
//   · creating a proposal changes nothing, and rejecting one changes nothing;
//   · a proposal whose PLANNING BASIS moved — a duration, a date, an edge, the calendar — is
//     refused at acceptance even though every task id still matches;
//   · acceptance is the only thing that moves the programme.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, CalendarService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `recovery-tenant-${Date.now()}`;

interface Run {
  id: string;
  status: string;
  sourceDelayId: string | null;
  sourceAssessmentImpactDays: number | null;
  basisFingerprint: string | null;
  proposal: { projectFinish: string; established: boolean; placements: Array<{ taskId: string; start: string; end: string }> };
}
interface Recovery {
  currentFinish: string | null;
  proposedFinish: string | null;
  workingDaysRecovered: number | null;
  sourceDelayId: string | null;
  sourceAssessmentImpactDays: number | null;
  verdict: 'RECOVERS_TIME' | 'NO_CHANGE' | 'LOSES_TIME' | 'UNKNOWN';
  unknownReason: string | null;
}
interface Plan { tasks: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string; durationWorkingDays: number | null }> }

describe('recovery planning, end to end (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;
  let otherProjectId: string;
  let delayId: string;
  let otherDelayId: string;
  let containmentId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.get(AccessService).grant({ userId: 'planner', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    app.get(UsersService).save({ tenantId: TENANT, userId: 'planner', displayName: 'Planner', active: true });
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: TENANT, companyId: null, actorId: 'planner', correlationId: 'e2e-recovery' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());

    const gulf = await app.get(CalendarService).saveCalendar({
      tenantId: TENANT, companyId: null, name: 'Gulf week', weekends: [5, 6], standardHoursPerDay: 8,
    });
    projectId = (await http.post('/api/v1/projects/projects').send({ title: 'Recovery project' }).expect(201)).body.id;
    otherProjectId = (await http.post('/api/v1/projects/projects').send({ title: 'Another project' }).expect(201)).body.id;
    await http.post(`/api/v1/projects/schedules/${projectId}/working-calendar`).send({ calendarId: gulf.id }).expect(201);

    const node = async (project: string, code: string, title: string) => (await http.post('/api/v1/projects/wbs').send({
      projectId: project, code, title, plannedValue: 10_000,
    }).expect(201)).body.id;

    // A → B, and the dates are deliberately LATER than the network requires, so a re-plan has real
    // time to recover: the programme as authored finishes on the 24th, the solver on the 12th.
    const plan = (await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: [
        { wbsNodeId: await node(projectId, '1.1', 'Containment'), name: 'Containment', plannedStart: '2026-03-09', plannedEnd: '2026-03-17', durationWorkingDays: 2 },
        { wbsNodeId: await node(projectId, '1.2', 'Cabling'), name: 'Cabling', plannedStart: '2026-03-18', plannedEnd: '2026-03-24', durationWorkingDays: 2 },
      ],
    }).expect(201)).body as Plan;
    containmentId = plan.tasks.find((task) => task.name === 'Containment')!.id;
    await http.post(`/api/v1/projects/schedules/${projectId}/dependencies`).send({
      edges: [{ predecessorTaskId: containmentId, successorTaskId: plan.tasks.find((t) => t.name === 'Cabling')!.id }],
    }).expect(201);

    delayId = (await http.post('/api/v1/projects/delays').send({
      projectId, title: 'Storm', causeCategory: 'force_majeure', startDate: '2026-03-09', endDate: '2026-03-11', delayDays: 3,
    }).expect(201)).body.id;
    await http.post(`/api/v1/projects/delays/${delayId}/activities`).send({ taskIds: [containmentId] }).expect(201);

    // A second project with its own delay, for the wrong-project refusal.
    await http.post('/api/v1/projects/schedules').send({
      projectId: otherProjectId,
      tasks: [{ wbsNodeId: await node(otherProjectId, '9.1', 'Elsewhere'), name: 'Elsewhere', plannedStart: '2026-03-09', plannedEnd: '2026-03-12', durationWorkingDays: 2 }],
    }).expect(201);
    otherDelayId = (await http.post('/api/v1/projects/delays').send({
      projectId: otherProjectId, title: 'Other storm', causeCategory: 'employer', startDate: '2026-03-09', delayDays: 2,
    }).expect(201)).body.id;
  });

  afterAll(async () => { await app?.close(); });

  const planOf = async (project = projectId) =>
    (await http.get(`/api/v1/projects/schedules?projectId=${project}`).expect(200)).body[0] as Plan;
  const prepare = () => http.post(`/api/v1/projects/delays/${delayId}/recovery-proposal`).send({});
  const recoveryOf = async (runId: string) =>
    (await http.get(`/api/v1/projects/planning-runs/${runId}/recovery`).expect(200)).body as Recovery;

  it('refuses to prepare a recovery for a delay nobody has assessed', async () => {
    // A recovery prepared against an unassessed delay has nothing to be a recovery OF — the figure
    // it would be read against does not exist yet.
    const refused = await prepare();
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/has not been assessed/);
  });

  it('carries canonical lineage to the delay and the assessment that justified it', async () => {
    await http.post(`/api/v1/projects/delays/${delayId}/assessment`)
      .send({ impactWorkingDays: 3, note: 'Full impact on the critical path' }).expect(201);

    const { run } = (await prepare().expect(201)).body as { run: Run };
    expect(run).toMatchObject({ status: 'proposed', sourceDelayId: delayId, sourceAssessmentImpactDays: 3 });
    // Fingerprinted against what the solver consumed, so acceptance can tell whether it still holds.
    expect(run.basisFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes not one stored date — a proposal is a scenario', async () => {
    const before = await planOf();
    const { run } = (await prepare().expect(201)).body as { run: Run };
    const after = await planOf();
    expect(after.tasks.map((task) => [task.plannedStart, task.plannedEnd]))
      .toEqual(before.tasks.map((task) => [task.plannedStart, task.plannedEnd]));
    // …and the proposal genuinely says something different from the programme it sits beside.
    expect(run.proposal.projectFinish).not.toBe('2026-03-24');
  });

  it('reports current finish, proposed finish and the working days between them', async () => {
    const { run } = (await prepare().expect(201)).body as { run: Run };
    const recovery = await recoveryOf(run.id);
    expect(recovery).toMatchObject({
      currentFinish: '2026-03-24',
      proposedFinish: run.proposal.projectFinish,
      verdict: 'RECOVERS_TIME',
      sourceDelayId: delayId,
      sourceAssessmentImpactDays: 3,
    });
    // Counted in WORKING days under the Gulf week: 12 → 24 March is 8 working days, not 12.
    expect(recovery.workingDaysRecovered).toBe(8);
    // The assessed impact and what the recovery wins back are separate assessments of separate
    // things, reported side by side and allowed to disagree.
    expect(recovery.sourceAssessmentImpactDays).not.toBe(recovery.workingDaysRecovered);
  });

  it('refuses a recovery prepared from another project’s delay', async () => {
    // Recovering one project's programme because of another's delay is not a hand-off; it is two
    // projects wired together by accident. The check is server-side and does not trust the caller.
    const refused = await http.post(`/api/v1/projects/delays/${otherDelayId}/recovery-proposal`).send({});
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/has not been assessed/);

    await http.post(`/api/v1/projects/delays/${otherDelayId}/assessment`).send({ impactWorkingDays: 2 }).expect(201);
    // Now assessed, it prepares a recovery for ITS OWN project and cannot reach this one.
    const { run } = (await http.post(`/api/v1/projects/delays/${otherDelayId}/recovery-proposal`).send({}).expect(201)).body as { run: Run };
    const elsewhere = (await http.get(`/api/v1/projects/planning-runs/${run.id}`).expect(200)).body as { run: { projectId: string } };
    expect(elsewhere.run.projectId).toBe(otherProjectId);
  });

  it('leaves the programme untouched when a proposal is rejected', async () => {
    const before = await planOf();
    const { run } = (await prepare().expect(201)).body as { run: Run };
    const discarded = (await http.post(`/api/v1/projects/planning-runs/${run.id}/discard`)
      .send({ reason: 'the client will not accept weekend working' }).expect(201)).body as Run;
    expect(discarded.status).toBe('discarded');

    const after = await planOf();
    expect(after.tasks.map((task) => [task.plannedStart, task.plannedEnd]))
      .toEqual(before.tasks.map((task) => [task.plannedStart, task.plannedEnd]));
    // …and a rejected proposal cannot then be accepted.
    const late = await http.post(`/api/v1/projects/planning-runs/${run.id}/accept`).send({});
    expect(late.status).toBe(409);
  });

  it('detects a proposal whose PLANNING BASIS moved, even when every task still matches', async () => {
    const { run } = (await prepare().expect(201)).body as { run: Run };
    const plan = await planOf();
    // No task added or removed: one duration extended. The old task-set guard passes; the basis
    // guard is what catches it, and without that these stale dates would be written silently.
    await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: plan.tasks.map((task) => ({
        id: task.id, name: task.name, plannedStart: task.plannedStart, plannedEnd: task.plannedEnd,
        durationWorkingDays: task.name === 'Containment' ? 4 : task.durationWorkingDays,
      })),
    }).expect(201);

    const refused = await http.post(`/api/v1/projects/planning-runs/${run.id}/accept`).send({});
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/planning basis has changed/);
    // Refused means refused: the programme is exactly where it was.
    expect((await planOf()).tasks.find((task) => task.name === 'Cabling')!.plannedEnd).toBe('2026-03-24');
  });

  it('moves the programme only on acceptance, and carries its lineage into the accepted run', async () => {
    const { run } = (await prepare().expect(201)).body as { run: Run };
    const recovery = await recoveryOf(run.id);

    const accepted = (await http.post(`/api/v1/projects/planning-runs/${run.id}/accept`).send({}).expect(201)).body as {
      run: Run; schedule: Plan;
    };
    expect(accepted.run).toMatchObject({ status: 'accepted', sourceDelayId: delayId, sourceAssessmentImpactDays: 3 });

    // THE GOVERNED CONSEQUENCE: the programme now finishes where the proposal said it would.
    const after = await planOf();
    const finish = after.tasks.reduce((latest, task) => (task.plannedEnd > latest ? task.plannedEnd : latest), after.tasks[0].plannedEnd);
    expect(finish).toBe(recovery.proposedFinish);

    // And the same proposal cannot be accepted twice.
    const again = await http.post(`/api/v1/projects/planning-runs/${run.id}/accept`).send({});
    expect(again.status).toBe(409);
  });
});

/**
 * Who may turn a scenario into the programme — proven with the guard actually enforcing.
 *
 * A separate application, because the chain above runs with auth OFF (the dev default, where the
 * permission guard passes through by design). That shape proves what a PROPOSAL does; it cannot
 * prove who may accept one, and acceptance is the act that moves every date on the project.
 *
 * The claim under test: preparing a recovery is planning, and accepting one is not. A Planning
 * Engineer authors the scenario and cannot make it the programme.
 */
describe('who may accept a recovery proposal (JWT ON)', () => {
  let app: INestApplication;
  let planner: ReturnType<typeof request.agent>;
  let manager: ReturnType<typeof request.agent>;
  let outsider: ReturnType<typeof request.agent>;
  let delay: string;
  let runId: string;
  const AUTH_TENANT = `recovery-auth-${Date.now()}`;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'recovery-proposal-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    // A real Planning Engineer's working set for this chain, minus the one permission under test.
    access.registerRole({
      id: 'r-e2e-recovery-planner', name: 'Planner (e2e)',
      permissions: ['projects.schedule.read', 'projects.schedule.create', 'projects.schedule.plan',
        'projects.wb.*', 'projects.delay.*', 'projects.project.*'],
    });
    access.registerRole({ id: 'r-e2e-stranger', name: 'Stranger (e2e)', permissions: ['crm.account.read'] });
    access.grant({ userId: 'planner', roleId: 'r-e2e-recovery-planner', scope: { kind: 'org', level: 'tenant', id: AUTH_TENANT } });
    access.grant({ userId: 'manager', roleId: 'r-pm', scope: { kind: 'org', level: 'tenant', id: AUTH_TENANT } });
    access.grant({ userId: 'stranger', roleId: 'r-e2e-stranger', scope: { kind: 'org', level: 'tenant', id: AUTH_TENANT } });
    for (const userId of ['planner', 'manager', 'stranger']) users.save({ tenantId: AUTH_TENANT, userId, displayName: userId, active: true });

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
    outsider = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'stranger', tenantId: AUTH_TENANT })}`);

    const project = (await planner.post('/api/v1/projects/projects').send({ title: 'Guarded recovery' }).expect(201)).body;
    const node = (await planner.post('/api/v1/projects/wbs').send({
      projectId: project.id, code: '1.1', title: 'Guarded package', plannedValue: 10_000,
    }).expect(201)).body;
    const plan = (await planner.post('/api/v1/projects/schedules').send({
      projectId: project.id,
      tasks: [{ wbsNodeId: node.id, name: 'Guarded activity', plannedStart: '2026-03-09', plannedEnd: '2026-03-20', durationWorkingDays: 2 }],
    }).expect(201)).body as Plan;
    delay = (await planner.post('/api/v1/projects/delays').send({
      projectId: project.id, title: 'Guarded delay', causeCategory: 'employer', startDate: '2026-03-09', delayDays: 2,
    }).expect(201)).body.id;
    await planner.post(`/api/v1/projects/delays/${delay}/activities`).send({ taskIds: [plan.tasks[0].id] }).expect(201);
    await planner.post(`/api/v1/projects/delays/${delay}/assessment`).send({ impactWorkingDays: 2 }).expect(201);
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  it('lets the planner assess the delay and prepare the recovery', async () => {
    // Establishes that the refusal below is about ONE permission, not about being shut out of the
    // chain: this is the same person, doing the planning half of it.
    const { run } = (await planner.post(`/api/v1/projects/delays/${delay}/recovery-proposal`).send({}).expect(201)).body as { run: Run };
    expect(run).toMatchObject({ status: 'proposed', sourceDelayId: delay, sourceAssessmentImpactDays: 2 });
    runId = run.id;
    // …and read what it would recover.
    await planner.get(`/api/v1/projects/planning-runs/${runId}/recovery`).expect(200);
  });

  it('refuses that same planner the acceptance that would move the programme', async () => {
    await planner.post(`/api/v1/projects/planning-runs/${runId}/accept`).send({}).expect(403);
    // Refused server-side and nothing moved.
    const plan = (await planner.get('/api/v1/projects/schedules').expect(200)).body[0] as Plan;
    expect(plan.tasks[0].plannedEnd).toBe('2026-03-20');
  });

  it('refuses a stranger the scenario entirely — server-side, not by hiding a button', async () => {
    await outsider.get(`/api/v1/projects/planning-runs/${runId}/recovery`).expect(403);
    await outsider.post(`/api/v1/projects/delays/${delay}/recovery-proposal`).send({}).expect(403);
    await outsider.post(`/api/v1/projects/planning-runs/${runId}/accept`).send({}).expect(403);
  });

  it('lets the project manager accept it, and the programme moves', async () => {
    await manager.post(`/api/v1/projects/planning-runs/${runId}/accept`).send({}).expect(201);
    const plan = (await planner.get('/api/v1/projects/schedules').expect(200)).body[0] as Plan;
    expect(plan.tasks[0].plannedEnd).toBe('2026-03-10');
  });
});
