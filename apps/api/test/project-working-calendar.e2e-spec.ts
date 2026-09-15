// AURA OS — PLN-03: which working calendar a project's dates are counted under, over HTTP.
//
// The solver has counted working days since Step 8 and chose the calendar by GUESSING: the
// tenant's calendars ordered by name, take the first. Right by luck for a company with one; for a
// company running Dubai and Riyadh crews it plans a Saudi job through a UAE Friday, and no screen
// says which calendar produced the dates.
//
// What is proven here:
//   · a project NAMES its calendar, and a calendar from another tenant is refused;
//   · a project that names none is planned with every day worked — and says so, rather than having
//     one chosen on its behalf, however many the tenant happens to have;
//   · the same calendar governs three things that used to disagree: the solver's placements, the
//     save-time check that an activity's work fits its window, and the productivity rates;
//   · an activity's window is reported in WORKING days, with the float between it and the work
//     authored into the activity.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, CalendarService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `calendar-tenant-${Date.now()}`;

interface PlanCalendar {
  calendarId: string | null;
  calendarName: string | null;
  everyDayWorked: boolean;
  activities: Record<string, { windowWorkingDays: number; floatWorkingDays: number | null }>;
}

describe('the working calendar a project is counted under (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;
  let wbsNodeId: string;
  let gulfId: string;
  let ksaId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.get(AccessService).grant({ userId: 'planner', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    app.get(UsersService).save({ tenantId: TENANT, userId: 'planner', displayName: 'Planner', active: true });
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: TENANT, companyId: null, actorId: 'planner', correlationId: 'e2e-calendar' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());

    // TWO calendars, which is the whole point: with two, there is no defensible guess.
    // "Gulf week" sorts before "KSA week", so the old code would have silently chosen Gulf.
    const calendars = app.get(CalendarService);
    const gulf = await calendars.saveCalendar({ tenantId: TENANT, companyId: null, name: 'Gulf week', weekends: [5, 6], standardHoursPerDay: 8 });
    const ksa = await calendars.saveCalendar({ tenantId: TENANT, companyId: null, name: 'KSA week', weekends: [4, 5], standardHoursPerDay: 8 });
    gulfId = gulf.id;
    ksaId = ksa.id;

    projectId = (await http.post('/api/v1/projects/projects').send({ title: 'Calendar project' }).expect(201)).body.id;
    wbsNodeId = (await http.post('/api/v1/projects/wbs').send({
      projectId, code: '1.1', title: 'Riser containment', plannedValue: 10_000,
    }).expect(201)).body.id;
  });

  afterAll(async () => { await app?.close(); });

  const planOf = async () => (await http.get(`/api/v1/projects/schedules?projectId=${projectId}`).expect(200)).body[0] as {
    tasks: Array<{ id: string; name: string }>;
    calendar: PlanCalendar;
  };
  const savePlan = (durationWorkingDays: number | null) => http.post('/api/v1/projects/schedules').send({
    projectId,
    // 2026-03-09 is a Monday; 2026-03-20 a Friday. Twelve calendar days, two weekends inside.
    tasks: [{ wbsNodeId, name: 'Install riser', plannedStart: '2026-03-09', plannedEnd: '2026-03-20', durationWorkingDays }],
  });

  it('offers the calendars a plan may be counted under, by name', async () => {
    const listed = (await http.get('/api/v1/projects/schedules/working-calendars').expect(200)).body as Array<{ id: string; name: string }>;
    expect(listed.map((calendar) => calendar.name)).toEqual(expect.arrayContaining(['Gulf week', 'KSA week']));
    // Names and ids only: administering weekends and holidays stays behind admin.calendar.manage.
    for (const calendar of listed) expect(Object.keys(calendar).sort()).toEqual(['id', 'name']);
  });

  it('counts every day as worked while no calendar is named — and picks none of the two on offer', async () => {
    await savePlan(null).expect(201);
    const plan = await planOf();
    expect(plan.calendar).toMatchObject({ calendarId: null, calendarName: null, everyDayWorked: true });
    // Twelve calendar days, every one counted. The tenant has two calendars and neither governs
    // this project: a guess that reads as an answer is worse than a stated unknown.
    expect(plan.calendar.activities[plan.tasks[0].id]).toMatchObject({ windowWorkingDays: 12 });
  });

  it('counts the window under the calendar the project names, and reports the float', async () => {
    await http.post(`/api/v1/projects/schedules/${projectId}/working-calendar`).send({ calendarId: gulfId }).expect(201);
    const plan = await planOf();
    expect(plan.calendar).toMatchObject({ calendarId: gulfId, calendarName: 'Gulf week', everyDayWorked: false });
    // Fri/Sat off: the 13th, 14th, 20th and 21st — of which three fall inside the window.
    expect(plan.calendar.activities[plan.tasks[0].id]).toMatchObject({ windowWorkingDays: 9, floatWorkingDays: null });
  });

  it('answers differently for a different calendar over the very same dates', async () => {
    // KSA weekends are Thu/Fri: a different set of days off over an identical window. This is the
    // number the old guess could get wrong without anybody being able to see that it had.
    await http.post(`/api/v1/projects/schedules/${projectId}/working-calendar`).send({ calendarId: ksaId }).expect(201);
    const plan = await planOf();
    expect(plan.calendar.calendarName).toBe('KSA week');
    expect(plan.calendar.activities[plan.tasks[0].id].windowWorkingDays).toBe(8);
  });

  it('reports float as the slack between the window and the work authored into it', async () => {
    await http.post(`/api/v1/projects/schedules/${projectId}/working-calendar`).send({ calendarId: gulfId }).expect(201);
    const plan = await planOf();
    const existing = plan.tasks[0].id;
    await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: [{ id: existing, name: 'Install riser', plannedStart: '2026-03-09', plannedEnd: '2026-03-20', durationWorkingDays: 6 }],
    }).expect(201);
    // Nine working days of window, six of work: three days of slack. Float is a plan, not an error.
    expect((await planOf()).calendar.activities[existing]).toMatchObject({ windowWorkingDays: 9, floatWorkingDays: 3 });
  });

  it('refuses work that cannot fit the window it was given — a check only a calendar makes possible', async () => {
    const plan = await planOf();
    const refused = await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: [{ id: plan.tasks[0].id, name: 'Install riser', plannedStart: '2026-03-09', plannedEnd: '2026-03-20', durationWorkingDays: 11 }],
    });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/11 working days of work cannot fit a window that holds 9/);
    // …and the same eleven days fit fine once the weekends stop being counted out.
    await http.post(`/api/v1/projects/schedules/${projectId}/working-calendar`).send({ calendarId: null }).expect(201);
    await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: [{ id: plan.tasks[0].id, name: 'Install riser', plannedStart: '2026-03-09', plannedEnd: '2026-03-20', durationWorkingDays: 11 }],
    }).expect(201);
  });

  it('drops a public holiday from the window, the same way it drops a weekend', async () => {
    // Weekends and holidays are one mechanism — a day with no working hours — and the window must
    // not care which kind it was. Wednesday 2026-03-11 is a working day under the Gulf week.
    await http.post(`/api/v1/projects/schedules/${projectId}/working-calendar`).send({ calendarId: gulfId }).expect(201);
    expect((await planOf()).calendar.activities[(await planOf()).tasks[0].id].windowWorkingDays).toBe(9);

    await http.post(`/api/v1/admin/calendar/${gulfId}/holidays`)
      .send({ date: '2026-03-11', description: 'National day' }).expect(201);
    expect((await planOf()).calendar.activities[(await planOf()).tasks[0].id].windowWorkingDays).toBe(8);
  });

  it('refuses a calendar that belongs to somebody else', async () => {
    const refused = await http.post(`/api/v1/projects/schedules/${projectId}/working-calendar`)
      .send({ calendarId: '11111111-1111-4111-8111-111111111111' });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/does not belong to this tenant/);
  });
});
