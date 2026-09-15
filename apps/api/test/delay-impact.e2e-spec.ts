// AURA OS — PLN-14: what a delay did to the completion date, over HTTP.
//
// An EOT claim is a contractual instrument, and the number in it is the most disputed figure on a
// construction project. Two facts are routinely mistaken for each other:
//
//   CLAIMED   how long the event lasted. A fact about the WORLD — the storm blew for ten days.
//   IMPACT    how many working days completion actually moved. A fact about the PLAN — a ten-day
//             storm on an activity with float moves completion by less, or by nothing.
//
// A contractor claims the first, an employer grants the second, and a system reporting only one of
// them has taken a side.
//
// What is proven here:
//   · a delay names ACTIVITIES canonically, not a WBS code somebody typed;
//   · the impact is derived by running the same CPM twice — as planned, and with the delay — so the
//     project has one answer to "when does this finish" rather than a bespoke delay calculator;
//   · float is visible in the arithmetic: a delay absorbed by it reports zero and says so;
//   · it is counted in WORKING days under the project's calendar;
//   · concurrency is NAMED and never apportioned;
//   · the ASSESSED figure is a recorded act that survives the plan moving underneath it, and the
//     two are shown side by side.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, CalendarService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `delay-tenant-${Date.now()}`;

interface DelayImpact {
  claimedDays: number;
  completionAsPlanned: string | null;
  completionWithDelay: string | null;
  impactWorkingDays: number | null;
  onCriticalPath: boolean;
  affected: Array<{ taskId: string; name: string; finishesAsPlanned: string | null; finishesWithDelay: string | null }>;
  concurrent: Array<{ id: string; title: string; causeCategory: string }>;
  verdict: 'IMPACT' | 'ABSORBED_BY_FLOAT' | 'UNKNOWN';
  unknownReason: string | null;
}

interface DelayEvent {
  id: string;
  affectedTaskIds: string[];
  status: string;
  assessedAt: string | null;
  assessedBy: string | null;
  assessedImpactWorkingDays: number | null;
  assessmentNote: string | null;
}

describe('what a delay did to the completion date (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;
  let criticalId: string;
  let spareId: string;
  let delayId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.get(AccessService).grant({ userId: 'planner', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    app.get(UsersService).save({ tenantId: TENANT, userId: 'planner', displayName: 'Planner', active: true });
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: TENANT, companyId: null, actorId: 'planner', correlationId: 'e2e-delay' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());

    const gulf = await app.get(CalendarService).saveCalendar({
      tenantId: TENANT, companyId: null, name: 'Gulf week', weekends: [5, 6], standardHoursPerDay: 8,
    });
    projectId = (await http.post('/api/v1/projects/projects').send({ title: 'Delay project' }).expect(201)).body.id;
    await http.post(`/api/v1/projects/schedules/${projectId}/working-calendar`).send({ calendarId: gulf.id }).expect(201);

    const node = async (code: string, title: string) => (await http.post('/api/v1/projects/wbs').send({
      projectId, code, title, plannedValue: 10_000,
    }).expect(201)).body.id;

    // A → B → C on the critical path, two working days each, plus a one-day activity off it with
    // plenty of slack. Monday 2026-03-09 start.
    const plan = (await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: [
        { wbsNodeId: await node('1.1', 'Containment'), name: 'Containment', plannedStart: '2026-03-09', plannedEnd: '2026-03-10', durationWorkingDays: 2 },
        { wbsNodeId: await node('1.2', 'Cabling'), name: 'Cabling', plannedStart: '2026-03-11', plannedEnd: '2026-03-12', durationWorkingDays: 2 },
        { wbsNodeId: await node('1.3', 'Termination'), name: 'Termination', plannedStart: '2026-03-15', plannedEnd: '2026-03-16', durationWorkingDays: 2 },
        { wbsNodeId: await node('2.1', 'Signage'), name: 'Signage', plannedStart: '2026-03-09', plannedEnd: '2026-03-09', durationWorkingDays: 1 },
      ],
    }).expect(201)).body as { tasks: Array<{ id: string; name: string }> };
    const idOf = (name: string) => plan.tasks.find((task) => task.name === name)!.id;
    criticalId = idOf('Containment');
    spareId = idOf('Signage');

    await http.post(`/api/v1/projects/schedules/${projectId}/dependencies`).send({
      edges: [
        { predecessorTaskId: criticalId, successorTaskId: idOf('Cabling') },
        { predecessorTaskId: idOf('Cabling'), successorTaskId: idOf('Termination') },
      ],
    }).expect(201);

    delayId = (await http.post('/api/v1/projects/delays').send({
      projectId, title: 'Storm', causeCategory: 'force_majeure', startDate: '2026-03-09',
      endDate: '2026-03-11', delayDays: 3, linkedActivityCode: '1.1',
    }).expect(201)).body.id;
  });

  afterAll(async () => { await app?.close(); });

  const impactOf = async () => (await http.get(`/api/v1/projects/delays/${delayId}/impact`).expect(200)).body as DelayImpact;
  const delayOf = async () => ((await http.get(`/api/v1/projects/delays?projectId=${projectId}`).expect(200)).body as DelayEvent[])
    .find((delay) => delay.id === delayId)!;

  it('says nothing while the delay names no activity the programme holds', async () => {
    // It carries a WBS code as free text, which is a note and not a link a claim can rest on.
    const impact = await impactOf();
    expect(impact).toMatchObject({ claimedDays: 3, verdict: 'UNKNOWN', impactWorkingDays: null });
    expect(impact.unknownReason).toMatch(/names no activity that is still in the programme/);
  });

  it('names the activities it hit, canonically', async () => {
    await http.post(`/api/v1/projects/delays/${delayId}/activities`).send({ taskIds: [criticalId] }).expect(201);
    expect((await delayOf()).affectedTaskIds).toEqual([criticalId]);
  });

  it('separates what was CLAIMED from what completion actually LOST', async () => {
    const impact = await impactOf();
    // Three days on the critical path: the whole claim lands on the completion date.
    expect(impact).toMatchObject({ claimedDays: 3, impactWorkingDays: 3, verdict: 'IMPACT', onCriticalPath: true });
    // Counted in WORKING days under the Gulf week, so the dates step over Friday and Saturday.
    expect(impact.completionAsPlanned).toBe('2026-03-16');
    expect(impact.completionWithDelay).toBe('2026-03-19');
    expect(impact.affected[0]).toMatchObject({ name: 'Containment', finishesAsPlanned: '2026-03-10' });
  });

  it('reports a delay absorbed by float as absorbed, not as three days lost', async () => {
    // The same three-day event moved onto an activity with slack. The commonest honest answer to an
    // EOT claim, and a real verdict rather than a failure to reach one.
    await http.post(`/api/v1/projects/delays/${delayId}/activities`).send({ taskIds: [spareId] }).expect(201);
    const impact = await impactOf();
    expect(impact).toMatchObject({ claimedDays: 3, impactWorkingDays: 0, verdict: 'ABSORBED_BY_FLOAT', onCriticalPath: false });
    expect(impact.completionAsPlanned).toBe(impact.completionWithDelay);
    expect(impact.unknownReason).toBeNull();
  });

  it('names a concurrent delay and its cause, and apportions nothing', async () => {
    await http.post('/api/v1/projects/delays').send({
      projectId, title: 'Late material', causeCategory: 'contractor',
      startDate: '2026-03-10', endDate: '2026-03-12', delayDays: 2,
    }).expect(201);
    await http.post(`/api/v1/projects/delays/${delayId}/activities`).send({ taskIds: [criticalId] }).expect(201);

    const impact = await impactOf();
    expect(impact.concurrent).toHaveLength(1);
    expect(impact.concurrent[0]).toMatchObject({ title: 'Late material', causeCategory: 'contractor' });
    // Untouched by it. Whether a contractor-caused delay running alongside this one reduces
    // liability is a question of contract and law, decided by people — halving a figure on that
    // basis would be inventing a legal position and hiding it inside arithmetic.
    expect(impact.impactWorkingDays).toBe(3);
  });

  it('records an assessment against a named person, and moves the delay to analysed', async () => {
    const assessed = (await http.post(`/api/v1/projects/delays/${delayId}/assessment`)
      .send({ impactWorkingDays: 3, note: 'Full impact on the critical path' }).expect(201)).body as DelayEvent;
    expect(assessed).toMatchObject({
      assessedImpactWorkingDays: 3, assessedBy: 'planner', status: 'analysed',
      assessmentNote: 'Full impact on the critical path',
    });
    expect(Date.parse(assessed.assessedAt!)).not.toBeNaN();
    // Zero is a real assessment — "absorbed by float" is an answer, not an absence of one.
    await http.post(`/api/v1/projects/delays/${delayId}/assessment`).send({ impactWorkingDays: 0 }).expect(201);
    expect((await delayOf()).assessedImpactWorkingDays).toBe(0);
  });

  it('refuses an assessment that is not a defensible figure', async () => {
    const negative = await http.post(`/api/v1/projects/delays/${delayId}/assessment`).send({ impactWorkingDays: -2 });
    expect(negative.status).toBe(400);
    expect(negative.body.message).toMatch(/cannot be negative/);
    const missing = await http.post(`/api/v1/projects/delays/${delayId}/assessment`).send({ note: 'no figure' });
    expect(missing.status).toBe(400);
    expect(missing.body.message).toMatch(/must state the working days of impact/);
  });

  it('keeps the assessed figure when the plan moves underneath it', async () => {
    await http.post(`/api/v1/projects/delays/${delayId}/assessment`).send({ impactWorkingDays: 3 }).expect(201);
    const plan = (await http.get(`/api/v1/projects/schedules?projectId=${projectId}`).expect(200)).body[0] as {
      tasks: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string; durationWorkingDays: number | null }>;
    };
    // Stretch the critical activity: the DERIVED impact of the same delay is now different, because
    // the programme is. The submitted figure is not — it was made against the plan as it stood.
    //
    // The window is widened with it, because PLN-03 refuses six working days of work in a window
    // that holds two — which is the rule catching this test, exactly as it would catch a planner.
    await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: plan.tasks.map((task) => ({
        id: task.id, name: task.name, plannedStart: task.plannedStart,
        plannedEnd: task.name === 'Containment' ? '2026-03-18' : task.plannedEnd,
        durationWorkingDays: task.name === 'Containment' ? 6 : task.durationWorkingDays,
      })),
    }).expect(201);

    expect((await delayOf()).assessedImpactWorkingDays).toBe(3);
    // Still three working days of movement — the delay is still the whole claim on the critical
    // path — but the completion dates it moves between are later, and both are shown.
    const impact = await impactOf();
    expect(impact.completionAsPlanned).not.toBe('2026-03-16');
    expect(impact.impactWorkingDays).toBe(3);
  });
});
