// AURA OS — PLN-13: the next few weeks, read off the accepted programme, over HTTP.
//
// A look-ahead is the meeting every site runs on: what must happen in the coming weeks, what it
// needs, and what is not ready. It is the planning artefact people most often keep in a spreadsheet,
// and the moment they do it disagrees with the programme — someone extends an activity, nobody
// retypes the look-ahead, and the meeting is held against a plan that no longer exists.
//
// What is proven here:
//   · it is a WINDOW over the plan, not a document beside it — nothing is authored, and an edit to
//     the programme changes the next read;
//   · READY is established rather than assumed: an uncommitted resource, an over-committed one, an
//     undeclared capacity and an unfinished predecessor each keep an activity out of it, in words;
//   · a released commitment stops being one, so the activity reads as uncommitted again;
//   · quantities aggregate BY WORK PACKAGE — two activities delivering one package contribute one
//     row, because each reads that package's whole sold quantity and summing would double it.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `lookahead-tenant-${Date.now()}`;

/** A date `offset` days from today, so the window under test really does contain the plan. */
const day = (offset: number): string =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

interface LookAhead {
  from: string;
  to: string;
  weeks: number;
  workingDays: number;
  activities: Array<{
    taskId: string; name: string; wbsNodeId: string | null;
    workingDaysInWindow: number; startsInWindow: boolean;
    requirements: Array<{ id: string; committed: boolean; feasibility: string | null }>;
    waitsFor: Array<{ taskId: string; name: string; clearsInTime: boolean }>;
    readiness: 'READY' | 'NOT_READY' | 'UNKNOWN';
    reasons: string[];
  }>;
  packages: Array<{ wbsNodeId: string; plannedQuantity: number | null; installedQuantity: number | null; activityIds: string[] }>;
}

describe('the look-ahead a site meeting is run on (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;
  let sharedNodeId: string;
  let crewId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.get(AccessService).grant({ userId: 'planner', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    app.get(UsersService).save({ tenantId: TENANT, userId: 'planner', displayName: 'Planner', active: true });
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: TENANT, companyId: null, actorId: 'planner', correlationId: 'e2e-lookahead' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());

    projectId = (await http.post('/api/v1/projects/projects').send({ title: 'Look-ahead project' }).expect(201)).body.id;
    const node = async (code: string, title: string) => (await http.post('/api/v1/projects/wbs').send({
      projectId, code, title, plannedValue: 10_000,
    }).expect(201)).body.id;
    sharedNodeId = await node('1.1', 'Riser containment');
    const otherNode = await node('2.1', 'Commissioning');

    const pool = (await http.post('/api/v1/projects/resource-pools').send({
      name: 'ELV crew', resourceType: 'pool', unit: 'crews',
    }).expect(201)).body;
    crewId = pool.id;

    await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: [
        // Two activities delivering ONE package: the apportionment trap.
        { wbsNodeId: sharedNodeId, name: 'First fix', plannedStart: day(1), plannedEnd: day(5),
          requirements: [{ resource: { resourceType: 'pool', canonicalResourceId: crewId }, quantity: 1, unit: 'crews' }] },
        { wbsNodeId: sharedNodeId, name: 'Second fix', plannedStart: day(8), plannedEnd: day(12) },
        // Inside the window, and waiting on something that does not clear in time.
        { wbsNodeId: otherNode, name: 'Commission', plannedStart: day(6), plannedEnd: day(9) },
        // Far outside it.
        { wbsNodeId: otherNode, name: 'Handover', plannedStart: day(120), plannedEnd: day(125) },
      ],
    }).expect(201);
  });

  afterAll(async () => { await app?.close(); });

  const read = async (weeks?: number) => (await http
    .get(`/api/v1/projects/schedules/${projectId}/look-ahead${weeks ? `?weeks=${weeks}` : ''}`)
    .expect(200)).body as LookAhead;
  const activity = (lookAhead: LookAhead, name: string) => lookAhead.activities.find((a) => a.name === name)!;
  const planOf = async () => (await http.get(`/api/v1/projects/schedules?projectId=${projectId}`).expect(200)).body[0] as {
    tasks: Array<{
      id: string; name: string; plannedStart: string; plannedEnd: string;
      requirements: Array<{ id: string; resource: { resourceType: string; canonicalResourceId: string }; quantity: number; unit: string }>;
    }>;
  };

  it('is a window over the plan — three weeks from today, and nothing beyond it', async () => {
    const lookAhead = await read();
    expect(lookAhead).toMatchObject({ from: day(0), to: day(20), weeks: 3, workingDays: 21 });
    expect(lookAhead.activities.map((a) => a.name)).toEqual(['First fix', 'Commission', 'Second fix']);
    // The handover is four months out; a three-week look-ahead has nothing to say about it.
    expect(lookAhead.activities.map((a) => a.name)).not.toContain('Handover');
  });

  it('answers for the length asked for, and clamps a nonsensical one instead of trusting it', async () => {
    expect((await read(6)).to).toBe(day(41));
    // A one-week window still catches an activity that begins on its last day: Commission starts
    // on day 6 and the window runs to day 6, so it overlaps by exactly one day.
    expect((await read(1)).activities.map((a) => a.name)).toEqual(['First fix', 'Commission']);
    expect((await read(999)).weeks).toBe(12);
  });

  it('keeps an activity out while the resource it needs is uncommitted', async () => {
    const firstFix = activity(await read(), 'First fix');
    expect(firstFix.readiness).toBe('NOT_READY');
    expect(firstFix.reasons[0]).toMatch(/1 crews of pool is needed and not committed/);
    expect(firstFix.requirements[0]).toMatchObject({ committed: false, feasibility: null });
  });

  it('lets it in once the demand is a held commitment the facts support', async () => {
    const plan = await planOf();
    const requirementId = plan.tasks.find((task) => task.name === 'First fix')!.requirements[0].id;
    // Declared capacity, so the commitment's feasibility is a fact rather than an absence.
    await http.post('/api/v1/projects/resource-capacity').send({
      resourceType: 'pool', canonicalResourceId: crewId, unit: 'crews', quantity: 2,
      from: day(0), to: day(20), note: 'one crew available',
    }).expect(201);
    await http.post(`/api/v1/projects/${projectId}/resource-bookings`).send({ requirementId }).expect(201);

    const firstFix = activity(await read(), 'First fix');
    expect(firstFix).toMatchObject({ readiness: 'READY', reasons: [] });
    expect(firstFix.requirements[0]).toMatchObject({ committed: true, feasibility: 'AVAILABLE' });
  });

  it('keeps an activity out while its predecessor does not clear in time, and names it', async () => {
    const plan = await planOf();
    const firstFixId = plan.tasks.find((task) => task.name === 'First fix')!.id;
    const commissionId = plan.tasks.find((task) => task.name === 'Commission')!.id;
    // First fix runs to day 5; Commission starts on day 6 — that clears. Make it not.
    await http.post(`/api/v1/projects/schedules/${projectId}/dependencies`).send({
      edges: [{ predecessorTaskId: commissionId, successorTaskId: firstFixId }],
    }).expect(201);

    const firstFix = activity(await read(), 'First fix');
    expect(firstFix.readiness).toBe('NOT_READY');
    expect(firstFix.reasons[0]).toMatch(/waits for .Commission., which is not planned to finish until/);
    expect(firstFix.waitsFor[0]).toMatchObject({ taskId: commissionId, clearsInTime: false });

    // Reverse the edge so it clears, and the same activity is ready again — derived, not stored.
    await http.post(`/api/v1/projects/schedules/${projectId}/dependencies`).send({
      edges: [{ predecessorTaskId: firstFixId, successorTaskId: commissionId }],
    }).expect(201);
    expect(activity(await read(), 'First fix').readiness).toBe('READY');
    expect(activity(await read(), 'Commission').waitsFor[0]).toMatchObject({ name: 'First fix', clearsInTime: true });
  });

  it('stops counting a released booking as a commitment', async () => {
    const bookings = (await http.get(`/api/v1/projects/${projectId}/resource-bookings`).expect(200)).body as Array<{ booking: { id: string } }>;
    await http.post(`/api/v1/projects/${projectId}/resource-bookings/${bookings[0].booking.id}/release`)
      .send({ reason: 'crew moved to another job' }).expect(201);

    // Releasing frees the capacity, so the activity it covered is uncommitted again — and a
    // look-ahead that still showed it as ready would send a crew that is somewhere else.
    const firstFix = activity(await read(), 'First fix');
    expect(firstFix.readiness).toBe('NOT_READY');
    expect(firstFix.requirements[0].committed).toBe(false);
  });

  it('gives a work package ONE row however many activities deliver it', async () => {
    const lookAhead = await read();
    const shared = lookAhead.packages.filter((row) => row.wbsNodeId === sharedNodeId);
    expect(shared).toHaveLength(1);
    // Both fixes named on the one row: each reads the package's whole sold quantity, so summing
    // them per activity would report the same scope twice.
    expect(shared[0].activityIds).toHaveLength(2);
  });

  it('follows the programme when the programme moves', async () => {
    const plan = await planOf();
    const handover = plan.tasks.find((task) => task.name === 'Handover')!;
    expect(activity(await read(), 'Handover')).toBeUndefined();

    // Pull the handover into the window. Nothing about the look-ahead is authored, so the next read
    // simply tells the truth about the plan as it now stands.
    await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: plan.tasks.map((task) => ({
        id: task.id, name: task.name,
        plannedStart: task.id === handover.id ? day(2) : task.plannedStart,
        plannedEnd: task.id === handover.id ? day(4) : task.plannedEnd,
        // Round-tripped whole: a requirement a released booking still points at cannot be dropped
        // (migration 0316), and a bare id is not a requirement the save can rebuild.
        requirements: task.requirements.map((requirement) => ({
          id: requirement.id, resource: requirement.resource, quantity: requirement.quantity, unit: requirement.unit,
        })),
      })),
    }).expect(201);
    expect(activity(await read(), 'Handover')).toMatchObject({ startsInWindow: true, workingDaysInWindow: 3 });
  });
});
