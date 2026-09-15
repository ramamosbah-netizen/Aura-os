// AURA OS — PLN-04: a milestone is a point where something must be TRUE, over HTTP.
//
// A milestone is where a programme is most tempted to lie. The date is what management reads and
// everything behind it is out of sight, so this proves the four ways that happens are all closed:
//
//   · the TARGET is authored and does NOT move when the plan moves — a milestone that recomputes
//     its own deadline can never be missed;
//   · the FORECAST comes from the schedule's own forecast run, so the milestone and the project
//     cannot disagree about when the same work finishes;
//   · a milestone nothing gates reads UNKNOWN, never ON_TRACK — a date with no work behind it is a
//     wish, and saying so is the whole point;
//   · and an achievement recorded against unfinished gating work is ACCEPTED and then STATED —
//     because real milestones are signed off with snags, and the lie is not the sign-off, it is the
//     silence about what is still open.
//
// Also proven: authoring a milestone is planning work, while declaring one MET is a statement to
// the client and costs a different permission (JWT ON, second describe).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `milestone-tenant-${Date.now()}`;

interface MilestoneView {
  milestone: {
    id: string; name: string; targetDate: string; ownerId: string | null;
    gatingTaskIds: string[]; achievedOn: string | null; achievedBy: string | null; achievedNote: string | null;
  };
  status: 'ACHIEVED' | 'ON_TRACK' | 'AT_RISK' | 'MISSED' | 'UNKNOWN';
  forecastDate: string | null;
  varianceWorkingDays: number | null;
  gating: Array<{ taskId: string; name: string; percentComplete: number; measured: boolean; forecastFinish: string | null; complete: boolean }>;
  measuredGating: number;
  achievedAgainstIncompleteWork: boolean;
  incompleteGating: Array<{ taskId: string; name: string }>;
  unknownReason: string | null;
}
interface Plan { tasks: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string; durationWorkingDays: number | null }> }

const today = () => new Date().toISOString().slice(0, 10);
/**
 * A date this many days from today.
 *
 * The whole programme below is anchored to today rather than to fixed calendar dates, because a
 * milestone's status depends on whether its target has PASSED — so a suite pinned to literal 2026
 * dates would quietly start reporting MISSED the moment real time overtook it, and the failure
 * would look like a defect in the rule rather than in the fixture.
 */
const fromToday = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** The programme starts sixty days out, so every target below is genuinely still ahead. */
const START = fromToday(60);
const day = (offset: number): string => fromToday(60 + offset);

describe('a point in the programme where something must be true (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;
  let firstTaskId: string;
  let secondTaskId: string;
  let access: AccessService;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    access = app.get(AccessService);
    const users = app.get(UsersService);
    access.grant({ userId: 'ms-pm', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 1_000_000 });
    users.save({ tenantId: TENANT, userId: 'ms-pm', displayName: 'ms-pm', active: true });
    users.save({ tenantId: TENANT, userId: 'ms-owner', displayName: 'ms-owner', active: true });
    app.use((req: { headers?: Record<string, string> }, _res: unknown, next: () => void) =>
      // The actor is per-request, so the receipt below can be read as the OWNER rather than as the
      // person who created the milestone — a handoff proved by one principal proves nothing.
      tenant.run({ tenantId: TENANT, companyId: null, actorId: req.headers?.['x-e2e-actor'] ?? 'ms-pm', correlationId: 'e2e-milestone' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());

    projectId = (await http.post('/api/v1/projects/projects').send({ title: 'Milestone job' }).expect(201)).body.id;
    await http.post(`/api/v1/projects/schedules/${projectId}/working-calendar`).send({ calendarId: null }).expect(201);
    const node = async (code: string, title: string) =>
      (await http.post('/api/v1/projects/wbs').send({ projectId, code, title, plannedValue: 20_000 }).expect(201)).body.id;

    // Two activities, four working days each, back to back, starting well after today. Every day is
    // worked, so the second finishes on START+7 and so does anything gating on both.
    const plan = (await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: [
        { wbsNodeId: await node('1.MS', 'Containment'), name: 'Containment', plannedStart: START, plannedEnd: day(3), durationWorkingDays: 4 },
        { wbsNodeId: await node('2.MS', 'Cabling'), name: 'Cabling', plannedStart: day(4), plannedEnd: day(7), durationWorkingDays: 4 },
      ],
    }).expect(201)).body as Plan;
    firstTaskId = plan.tasks.find((task) => task.name === 'Containment')!.id;
    secondTaskId = plan.tasks.find((task) => task.name === 'Cabling')!.id;
    await http.post(`/api/v1/projects/schedules/${projectId}/dependencies`).send({
      edges: [{ predecessorTaskId: firstTaskId, successorTaskId: secondTaskId }],
    }).expect(201);
  });

  afterAll(async () => { await app?.close(); });

  const milestones = async (): Promise<MilestoneView[]> =>
    (await http.get(`/api/v1/projects/schedules/${projectId}/milestones`).expect(200)).body as MilestoneView[];
  const named = async (name: string): Promise<MilestoneView> =>
    (await milestones()).find((view) => view.milestone.name === name)!;

  it('starts with none, rather than an invented one', async () => {
    expect(await milestones()).toEqual([]);
  });

  it('authors one against the programme, and reloads it', async () => {
    const created = (await http.post(`/api/v1/projects/schedules/${projectId}/milestones`).send({
      name: 'Level 1 energisation', targetDate: day(11),
      gatingTaskIds: [firstTaskId, secondTaskId],
    }).expect(201)).body;
    expect(created).toMatchObject({ name: 'Level 1 energisation', targetDate: day(11), achievedOn: null });

    const view = await named('Level 1 energisation');
    expect(view.milestone.gatingTaskIds).toHaveLength(2);
    // The gating work lands on START+7; the commitment is START+11. Four working days of room.
    expect(view).toMatchObject({ status: 'ON_TRACK', forecastDate: day(7), varianceWorkingDays: -4 });
  });

  it('names the gating activities so the date can be drilled into', async () => {
    const view = await named('Level 1 energisation');
    expect(view.gating.map((activity) => activity.name).sort()).toEqual(['Cabling', 'Containment']);
    expect(view.gating.every((activity) => activity.forecastFinish !== null)).toBe(true);
  });

  it('refuses to gate on an activity from another project', async () => {
    // Two projects wired together by accident is not a milestone; the composite foreign key refuses
    // it too, and this refuses it with a sentence naming which activity was wrong.
    const other = (await http.post('/api/v1/projects/projects').send({ title: 'Somebody else' }).expect(201)).body.id;
    const otherNode = (await http.post('/api/v1/projects/wbs').send({ projectId: other, code: '1.X', title: 'Theirs', plannedValue: 1_000 }).expect(201)).body.id;
    const theirs = (await http.post('/api/v1/projects/schedules').send({
      projectId: other,
      tasks: [{ wbsNodeId: otherNode, name: 'Their activity', plannedStart: START, plannedEnd: day(3), durationWorkingDays: 4 }],
    }).expect(201)).body as Plan;

    const refused = await http.post(`/api/v1/projects/schedules/${projectId}/milestones`).send({
      name: 'Borrowed gate', targetDate: day(11), gatingTaskIds: [theirs.tasks[0].id],
    }).expect(400);
    expect(refused.body.message).toMatch(/does not belong to project/);
  });

  it('refuses a second milestone with the same name on one project', async () => {
    // Two "Energisation" rows on one job are one milestone recorded twice, and every report
    // downstream would have to guess which was meant. A CONFLICT rather than bad input: the request
    // is well formed, and it is the project's existing state that forbids it.
    await http.post(`/api/v1/projects/schedules/${projectId}/milestones`).send({
      name: 'Level 1 energisation', targetDate: day(25), gatingTaskIds: [firstTaskId],
    }).expect(409);
  });

  it('reads UNKNOWN — never ON_TRACK — for a milestone nothing in the programme gates', async () => {
    // A date with no work behind it is a wish. Rounding that up to "on track" is the false
    // confidence the whole model exists to prevent.
    await http.post(`/api/v1/projects/schedules/${projectId}/milestones`).send({
      name: 'Client hands over site', targetDate: day(16), gatingTaskIds: [],
    }).expect(201);

    const view = await named('Client hands over site');
    expect(view).toMatchObject({ status: 'UNKNOWN', forecastDate: null, varianceWorkingDays: null });
    expect(view.unknownReason).toMatch(/no activity in this programme gates this milestone/);
  });

  it('moves the FORECAST when the plan slips, and leaves the COMMITMENT where it was', async () => {
    // The whole point of a target: it is what the slip is measured against, so it must not slip too.
    const plan = (await http.get(`/api/v1/projects/schedules?projectId=${projectId}`).expect(200)).body[0] as Plan;
    await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: plan.tasks.map((task) => ({
        id: task.id, name: task.name, plannedStart: task.plannedStart,
        plannedEnd: task.name === 'Cabling' ? day(22) : task.plannedEnd,
        durationWorkingDays: task.name === 'Cabling' ? 12 : task.durationWorkingDays,
      })),
    }).expect(201);

    const view = await named('Level 1 energisation');
    expect(view.milestone.targetDate).toBe(day(11));        // unmoved
    expect(view.forecastDate).toBe(day(15));                // twelve days of cabling after START+3
    expect(view).toMatchObject({ status: 'AT_RISK', varianceWorkingDays: 4 });
  });

  it('agrees with the project forecast about the same work', async () => {
    // One CPM run, not two. A milestone and a project that disagree about when the same activity
    // finishes is a system with no answer at all.
    const forecast = (await http.get(`/api/v1/projects/schedules/${projectId}/forecast`).expect(200)).body;
    expect((await named('Level 1 energisation')).forecastDate).toBe(forecast.forecastFinish);
  });

  it('refuses an achievement dated in a day that has not happened', async () => {
    const view = await named('Level 1 energisation');
    const refused = await http.post(`/api/v1/projects/milestones/${view.milestone.id}/achievement`)
      .send({ on: fromToday(30) }).expect(400);
    expect(refused.body.message).toMatch(/has not happened yet/);
  });

  it('records an achievement against UNFINISHED work — and states the contradiction', async () => {
    // The commonest way a programme lies to management: the report goes green, the work is at zero,
    // and nothing anywhere says both things at once. The sign-off is accepted, because real
    // milestones are accepted with snags; what is refused is the silence.
    const view = await named('Level 1 energisation');
    const achieved = (await http.post(`/api/v1/projects/milestones/${view.milestone.id}/achievement`)
      .send({ on: today(), note: 'Client accepted with snags' }).expect(201)).body as MilestoneView;

    expect(achieved.status).toBe('ACHIEVED');
    expect(achieved.milestone).toMatchObject({ achievedOn: today(), achievedBy: 'ms-pm', achievedNote: 'Client accepted with snags' });
    expect(achieved.achievedAgainstIncompleteWork).toBe(true);
    expect(achieved.incompleteGating.map((activity) => activity.name).sort()).toEqual(['Cabling', 'Containment']);
  });

  it('keeps stating the contradiction on every later read, not just at the moment of sign-off', async () => {
    const view = await named('Level 1 energisation');
    expect(view.status).toBe('ACHIEVED');
    expect(view.achievedAgainstIncompleteWork).toBe(true);
    expect(view.incompleteGating).toHaveLength(2);
  });

  it('refuses to overwrite an achievement already on the record', async () => {
    const view = await named('Level 1 energisation');
    const refused = await http.post(`/api/v1/projects/milestones/${view.milestone.id}/achievement`)
      .send({ on: today() }).expect(409);
    expect(refused.body.message).toMatch(/was already achieved/);
  });

  it('withdraws an achievement only with a reason, and puts the reason on the record', async () => {
    const view = await named('Level 1 energisation');
    await http.delete(`/api/v1/projects/milestones/${view.milestone.id}/achievement`).send({ reason: '  ' }).expect(400);

    const withdrawn = (await http.delete(`/api/v1/projects/milestones/${view.milestone.id}/achievement`)
      .send({ reason: 'client rejected the snag list' }).expect(200)).body as MilestoneView;
    expect(withdrawn.milestone.achievedOn).toBeNull();
    expect(withdrawn.milestone.achievedNote).toMatch(/withdrawn by ms-pm: client rejected the snag list/);
    // And it is judged on its forecast again, rather than staying green.
    expect(withdrawn.status).toBe('AT_RISK');
    expect(withdrawn.achievedAgainstIncompleteWork).toBe(false);
  });

  it('puts a named owner’s milestone in THEIR My Work, through the canonical responsibility path', async () => {
    // The next-role receipt. A milestone nobody was told about is a date in a database — and this
    // reuses the assignment chain AWD-06 already proved rather than inventing a second inbox, so the
    // owner accepts, starts and completes it in the one place they already look.
    access.grant({
      userId: 'ms-owner', roleId: 'r-pm',
      scope: { kind: 'resource', resourceType: 'project', resourceId: projectId },
    });

    const inboxBefore = (await http.get('/api/v1/work-items').set('x-e2e-actor', 'ms-owner').expect(200))
      .body as { items: Array<{ title: string }> };
    expect(inboxBefore.items.some((item) => item.title.startsWith('Milestone:'))).toBe(false);

    await http.post(`/api/v1/projects/schedules/${projectId}/milestones`).send({
      name: 'Riser shaft handover', targetDate: day(18), ownerId: 'ms-owner', gatingTaskIds: [secondTaskId],
    }).expect(201);

    const inboxAfter = (await http.get('/api/v1/work-items').set('x-e2e-actor', 'ms-owner').expect(200))
      .body as { items: Array<{ id: string; title: string; kind: string; dueAt: string | null; projectId: string }> };
    const received = inboxAfter.items.find((item) => item.title === 'Milestone: Riser shaft handover');
    expect(received, 'the owner did not receive the milestone').toBeDefined();
    // Carried with the project context and the COMMITTED date as the due date — the owner is
    // answerable for that day, not for whatever the plan currently forecasts.
    expect(received).toMatchObject({ kind: 'planning', dueAt: day(18), projectId });
    expect(received!.id.startsWith('project-responsibility:')).toBe(true);
  });

  it('REFUSES an owner who could never receive it, and saves nothing', async () => {
    // Naming an owner is naming a recipient. The responsibility service rightly refuses to assign
    // work to a non-member — so a milestone that saved anyway would report an owner who was never
    // told, which is precisely the silent gap between two records that the Wave 3 exit gate's
    // "next-role receipt must be proved" exists to forbid. A log line is not a receipt.
    const before = (await milestones()).length;
    const refused = await http.post(`/api/v1/projects/schedules/${projectId}/milestones`).send({
      name: 'Owned by an outsider', targetDate: day(19), ownerId: 'ms-stranger', gatingTaskIds: [firstTaskId],
    }).expect(400);
    expect(refused.body.message).toMatch(/is not a member of project/);
    // Nothing half-written: no milestone, so no owner recorded against a receipt that never happened.
    expect(await milestones()).toHaveLength(before);
    expect((await milestones()).some((view) => view.milestone.name === 'Owned by an outsider')).toBe(false);
  });

  it('still allows a milestone with no owner at all — unowned is a state, not an error', async () => {
    await http.post(`/api/v1/projects/schedules/${projectId}/milestones`).send({
      name: 'Nobody answerable', targetDate: day(21), gatingTaskIds: [firstTaskId],
    }).expect(201);
    expect((await named('Nobody answerable')).milestone.ownerId).toBeNull();
  });

  it('tells nobody when no owner was named, rather than assigning it to whoever created it', async () => {
    // A milestone with no owner is unowned. Defaulting it to its author would put a due date in
    // somebody's list that they never accepted.
    const ownerless = (await http.get('/api/v1/work-items').set('x-e2e-actor', 'ms-pm').expect(200))
      .body as { items: Array<{ title: string }> };
    expect(ownerless.items.some((item) => item.title === 'Milestone: Level 1 energisation')).toBe(false);
  });

  it('reports another tenant’s milestone as not found rather than forbidden', async () => {
    // Confirming an id exists elsewhere is itself a disclosure.
    await http.post('/api/v1/projects/milestones/00000000-0000-0000-0000-000000000000/achievement')
      .send({ on: today() }).expect(404);
  });
});

/**
 * Authoring a milestone is planning work. Declaring one MET is a statement to the client about what
 * has been delivered, and it costs a different permission — the same separation
 * `schedule.progress-override` makes, and for the same reason: the person who maintains the figure
 * must not also be the one who declares it true.
 */
describe('what declaring a milestone met costs (JWT ON)', () => {
  let app: INestApplication;
  let planner: ReturnType<typeof request.agent>;
  let manager: ReturnType<typeof request.agent>;
  let projectId: string;
  let milestoneId: string;
  const AUTH_TENANT = `milestone-auth-${Date.now()}`;

  beforeAll(async () => {
    // Set before the container is built: AuthService reads the secret in a field initialiser.
    process.env.AUTH_JWT_SECRET = 'milestone-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    // A real Planning Engineer's working set, minus the one permission under test. Bespoke rather
    // than `r-planning-engineer` so the only variable here is that permission; that the shipped role
    // genuinely lacks it — and that the Project Manager holds it — is asserted over the role
    // catalogue itself in src/auth/elv-roles.test.ts.
    access.registerRole({
      id: 'r-e2e-ms-planner', name: 'Planner (e2e)',
      permissions: [
        'projects.schedule.read', 'projects.schedule.create', 'projects.schedule.plan', 'projects.wb.read',
        'projects.milestone.read', 'projects.milestone.create',
      ],
    });
    access.grant({ userId: 'planner', roleId: 'r-e2e-ms-planner', scope: { kind: 'org', level: 'tenant', id: AUTH_TENANT } });
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

    projectId = (await manager.post('/api/v1/projects/projects').send({ title: 'Guarded milestones' }).expect(201)).body.id;
    const node = (await manager.post('/api/v1/projects/wbs').send({ projectId, code: '1.G', title: 'Guarded package', plannedValue: 10_000 }).expect(201)).body;
    await manager.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: [{ wbsNodeId: node.id, name: 'Guarded activity', plannedStart: START, plannedEnd: day(7), durationWorkingDays: 5 }],
    }).expect(201);
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  it('lets the planner author a milestone — this is planning work', async () => {
    // Establishes that the refusal below is about ONE permission, not about the planner being shut
    // out of milestones altogether.
    const created = (await planner.post(`/api/v1/projects/schedules/${projectId}/milestones`)
      .send({ name: 'Guarded milestone', targetDate: day(20) }).expect(201)).body;
    milestoneId = created.id;
    expect(created.name).toBe('Guarded milestone');
  });

  it('lets the planner read where it stands', async () => {
    const views = (await planner.get(`/api/v1/projects/schedules/${projectId}/milestones`).expect(200)).body as MilestoneView[];
    expect(views.map((view) => view.milestone.name)).toContain('Guarded milestone');
  });

  it('refuses the planner the act of declaring it MET', async () => {
    await planner.post(`/api/v1/projects/milestones/${milestoneId}/achievement`).send({ on: today() }).expect(403);
  });

  it('and refuses them the withdrawal of one, which is the same authority in reverse', async () => {
    await planner.delete(`/api/v1/projects/milestones/${milestoneId}/achievement`).send({ reason: 'anything' }).expect(403);
  });

  it('lets the Project Manager declare it met', async () => {
    const achieved = (await manager.post(`/api/v1/projects/milestones/${milestoneId}/achievement`)
      .send({ on: today(), note: 'Witnessed' }).expect(201)).body as MilestoneView;
    expect(achieved).toMatchObject({ status: 'ACHIEVED' });
    expect(achieved.milestone.achievedBy).toBe('manager');
  });

  it('refuses an unauthenticated caller outright', async () => {
    await request(app.getHttpServer()).get(`/api/v1/projects/schedules/${projectId}/milestones`).expect(401);
  });
});
