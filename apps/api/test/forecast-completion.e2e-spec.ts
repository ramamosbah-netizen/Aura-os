// AURA OS — PLN-16: when this project will actually finish, over HTTP.
//
// Three dates, and a management report that confuses any two of them is worse than no report:
//
//   BASELINE   what was committed to (PLN-05). The yardstick, and the only one that does not move.
//   PLANNED    what the programme says today.
//   FORECAST   where the work is heading, derived from what has actually been INSTALLED.
//
// A "forecast" that repeats the planned finish is not a forecast; it is the plan with a new label,
// and it is the most common lie a project system tells.
//
// What is proven here:
//   · the forecast is built from REMAINING work, so it differs from the plan when the evidence says
//     it should and matches it when nothing has moved;
//   · the variance is against the BASELINE, not against a plan somebody edited this morning;
//   · the activities that decide the date are named, so the figure can be drilled into;
//   · the CONFIDENCE travels with the date — a forecast resting on declared progress says so;
//   · and it refuses to forecast a programme it cannot place.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, CalendarService, TenantContext, UsersService } from '@aura/core';
import { QuantityLedgerService } from '@aura/projects';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { createGovernedDeliveryFixture } from './helpers/governed-delivery-fixture';

const TENANT = `forecast-tenant-${Date.now()}`;

interface Forecast {
  baselineFinish: string | null;
  plannedFinish: string | null;
  forecastFinish: string | null;
  varianceWorkingDays: number | null;
  planOptimismWorkingDays: number | null;
  confidence: 'MEASURED' | 'PARTLY_MEASURED' | 'DECLARED' | 'UNKNOWN';
  measuredDrivers: number;
  driverCount: number;
  contributors: Array<{ taskId: string; name: string; remainingWorkingDays: number | null; percentComplete: number; measured: boolean; forecastFinish: string | null }>;
  unknownReason: string | null;
}
interface Plan { tasks: Array<{ id: string; name: string; plannedStart: string; plannedEnd: string; durationWorkingDays: number | null }> }

describe('when this project will actually finish (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;
  let boqItemId: string;
  let measuredTaskId: string;
  let declaredTaskId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);
    for (const userId of ['qty-maker', 'qty-checker']) {
      access.grant({ userId, roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 1_000_000 });
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }
    app.use((req: { headers?: Record<string, string> }, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: TENANT, companyId: null, actorId: req.headers?.['x-e2e-actor'] ?? 'qty-maker', correlationId: 'e2e-forecast' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());

    // A governed award, so one activity's progress can be MEASURED rather than declared — which is
    // what the confidence figure is about.
    const fixture = await createGovernedDeliveryFixture(
      http, app.get(QuantityLedgerService), 'Riser', 200, 'm2', TENANT, { count: 2, hours: 100 });
    projectId = fixture.project.id;
    boqItemId = fixture.boqItemId;
    await http.post(`/api/v1/projects/schedules/${projectId}/working-calendar`).send({ calendarId: null }).expect(201);

    const unmeasured = (await http.post('/api/v1/projects/wbs').send({
      projectId, code: '2.Riser', title: 'Riser commissioning', plannedValue: 40_000,
    }).expect(201)).body.id;

    // Four working days each, back to back, every day worked: the plan finishes on the 16th.
    const plan = (await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: [
        { wbsNodeId: fixture.wbs.id, name: 'Install riser', plannedStart: '2026-03-09', plannedEnd: '2026-03-12', durationWorkingDays: 4 },
        { wbsNodeId: unmeasured, name: 'Commission riser', plannedStart: '2026-03-13', plannedEnd: '2026-03-16', durationWorkingDays: 4 },
      ],
    }).expect(201)).body as Plan;
    measuredTaskId = plan.tasks.find((task) => task.name === 'Install riser')!.id;
    declaredTaskId = plan.tasks.find((task) => task.name === 'Commission riser')!.id;
    await http.post(`/api/v1/projects/schedules/${projectId}/dependencies`).send({
      edges: [{ predecessorTaskId: measuredTaskId, successorTaskId: declaredTaskId }],
    }).expect(201);
  });

  afterAll(async () => { await app?.close(); });

  const forecastOf = async () =>
    (await http.get(`/api/v1/projects/schedules/${projectId}/forecast`).expect(200)).body as Forecast;

  it('states no variance while nothing has been committed to', async () => {
    // A project with no baseline has nothing to be late against, and "0 days late" would be an
    // answer rather than the absence of one.
    const forecast = await forecastOf();
    expect(forecast).toMatchObject({ baselineFinish: null, varianceWorkingDays: null, plannedFinish: '2026-03-16' });
    expect(forecast.forecastFinish).toBe('2026-03-16');
  });

  it('matches the plan once baselined, while nothing has moved', async () => {
    await http.post(`/api/v1/projects/schedules/${projectId}/baseline`).send({}).expect(201);
    const forecast = await forecastOf();
    expect(forecast).toMatchObject({
      baselineFinish: '2026-03-16', plannedFinish: '2026-03-16', forecastFinish: '2026-03-16',
      varianceWorkingDays: 0, planOptimismWorkingDays: 0,
    });
  });

  it('names the activities that decide the date, in the order they run', async () => {
    const forecast = await forecastOf();
    expect(forecast.contributors.map((contributor) => contributor.name)).toEqual(['Install riser', 'Commission riser']);
    expect(forecast.contributors[0]).toMatchObject({ remainingWorkingDays: 4, percentComplete: 0 });
  });

  it('carries the measured/declared split into the confidence from the outset', async () => {
    // Both activities read zero, and the two zeros are NOT the same fact (PLN-12): the first
    // activity's work package is quantity-controlled, so its zero is a measurement; the second's is
    // somebody's declaration. One driver of two is evidence, and the figure says PARTLY — never
    // rounded up to a confident date, and never down to a worthless one.
    const forecast = await forecastOf();
    expect(forecast).toMatchObject({ confidence: 'PARTLY_MEASURED', measuredDrivers: 1, driverCount: 2 });
    expect(forecast.contributors.find((contributor) => contributor.taskId === measuredTaskId)!.measured).toBe(true);
    expect(forecast.contributors.find((contributor) => contributor.taskId === declaredTaskId)!.measured).toBe(false);
  });

  it('pulls the date IN when site actually installs, and upgrades the confidence with it', async () => {
    // 100 of 200 m² installed: the measured activity is half done, so two of its four days are gone.
    await http.post('/api/v1/site/installations')
      .send({ projectId, boqItemId, date: '2026-03-10', description: 'Riser L1-L2', quantity: 100, unit: 'm2' }).expect(201);

    const forecast = await forecastOf();
    expect(forecast.forecastFinish).toBe('2026-03-14');
    // Two working days pulled in against the baseline, and the plan is now behind the evidence.
    expect(forecast).toMatchObject({ varianceWorkingDays: -2, planOptimismWorkingDays: -2 });
    // Still one measured driver of two — the installation moved the DATE, not the confidence,
    // which is the right separation: evidence about quantity is not evidence about the other
    // activity's progress.
    expect(forecast).toMatchObject({ confidence: 'PARTLY_MEASURED', measuredDrivers: 1, driverCount: 2 });
    const driver = forecast.contributors.find((contributor) => contributor.taskId === measuredTaskId)!;
    expect(driver).toMatchObject({ percentComplete: 50, measured: true, remainingWorkingDays: 2 });
  });

  it('pushes the date OUT — and reports lateness against the baseline — when the plan is stretched', async () => {
    const plan = (await http.get(`/api/v1/projects/schedules?projectId=${projectId}`).expect(200)).body[0] as Plan;
    await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: plan.tasks.map((task) => ({
        id: task.id, name: task.name, plannedStart: task.plannedStart,
        plannedEnd: task.name === 'Commission riser' ? '2026-03-24' : task.plannedEnd,
        durationWorkingDays: task.name === 'Commission riser' ? 10 : task.durationWorkingDays,
      })),
    }).expect(201);

    const forecast = await forecastOf();
    // Two days left on the measured activity plus ten on the other: the work lands past the
    // committed date, and the variance is measured against THAT rather than against today's plan.
    expect(forecast.forecastFinish).toBe('2026-03-20');
    expect(forecast.varianceWorkingDays).toBe(4);
    expect(forecast.baselineFinish).toBe('2026-03-16');
    // The baseline did not move when the plan did — which is the whole point of having one.
  });

  it('refuses to forecast a programme it cannot place', async () => {
    const plan = (await http.get(`/api/v1/projects/schedules?projectId=${projectId}`).expect(200)).body[0] as Plan;
    await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: plan.tasks.map((task) => ({
        id: task.id, name: task.name, plannedStart: task.plannedStart, plannedEnd: task.plannedEnd,
        durationWorkingDays: task.name === 'Commission riser' ? null : task.durationWorkingDays,
      })),
    }).expect(201);

    const forecast = await forecastOf();
    expect(forecast).toMatchObject({ confidence: 'UNKNOWN', forecastFinish: null, varianceWorkingDays: null });
    expect(forecast.unknownReason).toMatch(/cannot be placed/);
    // …while still reporting the two dates it does know, so a screen is not left blank.
    expect(forecast).toMatchObject({ baselineFinish: '2026-03-16', plannedFinish: '2026-03-24' });
  });
});
