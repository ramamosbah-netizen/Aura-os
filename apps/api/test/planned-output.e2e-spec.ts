// AURA OS — PLN-11: the rate the work was priced at, over HTTP.
//
// PLN-12 made an activity's progress a measured fact. This is the question that only becomes
// askable once it is: measured against WHAT? A bar at 60% is neither late nor early on its own.
//
// The chain under proof, every link a stored row and none of it retyped by a planner:
//
//   estimate resource sheet → AWARD (frozen with the handover) → work package → activity
//                                  ↘ Quantity Ledger (installed) ↗
//
// What is proven here:
//   · the award freezes how long the line was priced to take, and carries NO money with it;
//   · an activity reads the sold quantity and the priced rate without anyone entering either;
//   · the pace the work is actually going at is compared against the pace it was sold at;
//   · every fact nobody stated comes back as UNKNOWN carrying its reason — never as "on rate".
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, TenantContext, UsersService } from '@aura/core';
import { QuantityLedgerService } from '@aura/projects';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { createGovernedDeliveryFixture, until } from './helpers/governed-delivery-fixture';

const TENANT = `output-tenant-${Date.now()}`;

/** A date `offset` days from today, so an activity's window really does contain today. */
const day = (offset: number): string =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

interface LabourProductivity {
  spentManHours: number | null;
  earnedManHours: number | null;
  factor: number | null;
  unattributedManHours: number | null;
  unattributedShare: number | null;
  verdict: 'BETTER_THAN_PRICED' | 'AS_PRICED' | 'WORSE_THAN_PRICED' | 'UNKNOWN';
  unknownReason: string | null;
}

interface PlannedOutput {
  plannedQuantity: number | null;
  unit: string | null;
  installedQuantity: number | null;
  basis: Record<string, unknown> | null;
  pricedRatePerDay: number | null;
  pricedCrewDays: number | null;
  achievedRatePerDay: number | null;
  requiredRatePerDay: number | null;
  expectedByNow: number | null;
  verdict: 'AHEAD' | 'ON_RATE' | 'BEHIND' | 'UNKNOWN';
  unknownReason: string | null;
  labour: LabourProductivity;
}

describe('planned output — the rate the work was priced at (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;
  let boqItemId: string;
  let pricedTaskId: string;
  let unmappedTaskId: string;
  let wbsNodeId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    // The same filter main.ts installs, so a domain refusal reaches this spec as the status the
    // running API would give it rather than as an unclassified 500.
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);
    for (const userId of ['qty-maker', 'qty-checker']) {
      access.grant({ userId, roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 1_000_000 });
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }
    app.use((req: { headers?: Record<string, string> }, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: TENANT, companyId: null, actorId: req.headers?.['x-e2e-actor'] ?? 'qty-maker', correlationId: 'e2e-output' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());

    // 200 m² sold, priced at 2 technicians × 100 hours each for the whole line:
    //   1 man-hour per m², 0.5 crew-hours per m² with two working in parallel → 16 m²/day.
    const fixture = await createGovernedDeliveryFixture(
      http, app.get(QuantityLedgerService), 'Riser', 200, 'm2', TENANT, { count: 2, hours: 100 });
    projectId = fixture.project.id;
    boqItemId = fixture.boqItemId;
    wbsNodeId = fixture.wbs.id;

    // A second work package with no award line mapped to it: nothing was sold or priced for it.
    const unmapped = (await http.post('/api/v1/projects/wbs').send({
      projectId, code: '2.Riser', title: 'Riser commissioning', plannedValue: 40_000,
    }).expect(201)).body;

    // A window that already contains today, so the elapsed side of the rate is real: ten days used
    // of a twenty-day window.
    const plan = (await http.post('/api/v1/projects/schedules').send({
      projectId,
      tasks: [
        { wbsNodeId: fixture.wbs.id, name: 'Install riser containment', plannedStart: day(-9), plannedEnd: day(10) },
        { wbsNodeId: unmapped.id, name: 'Commission riser', plannedStart: day(-9), plannedEnd: day(10) },
      ],
    }).expect(201)).body;
    // By NAME, not by position: both activities share a window, so the saved order is not the
    // order they were sent in and indexing would silently test the wrong one.
    const named = (name: string) => (plan.tasks as Array<{ id: string; name: string }>).find((task) => task.name === name)!.id;
    pricedTaskId = named('Install riser containment');
    unmappedTaskId = named('Commission riser');
  });

  afterAll(async () => { await app?.close(); });

  const readPlan = async () => {
    const plans = (await http.get(`/api/v1/projects/schedules?projectId=${projectId}`).expect(200)).body as Array<{
      projectId: string; output: Record<string, PlannedOutput>;
    }>;
    return plans[0];
  };
  const outputOf = async (taskId: string) => (await readPlan()).output[taskId];
  const install = async (quantity: number, description: string) =>
    http.post('/api/v1/site/installations')
      .send({ projectId, boqItemId, date: day(0), description, quantity, unit: 'm2' }).expect(201);

  it('freezes how long the line was priced to take, and carries no money with it', async () => {
    const project = (await http.get(`/api/v1/projects/projects/${projectId}`).expect(200)).body as {
      handoverSnapshot: { sourceItems: Array<{ productivityBasis: Record<string, unknown> | null }> };
    };
    const basis = project.handoverSnapshot.sourceItems[0].productivityBasis;
    expect(basis).toMatchObject({
      crewSize: 2,
      manHoursPerUnit: 1,     // 2 × 100 ÷ 200
      crewHoursPerUnit: 0.5,  // …two working in parallel
    });
    // THE AUTHORITY BOUNDARY. Cost rates and margin stay behind `tendering.internal-pricing.access`;
    // what crosses into delivery is how long the work takes, which is physical, not commercial.
    // Freezing an hourly rate here would put the cost sheet inside every project anyone can open.
    // An exact key set, not a spot check: a new field added upstream must fail this test rather
    // than slip a cost into every project that anyone can open.
    expect(Object.keys(basis ?? {}).sort()).toEqual([
      'crewHoursPerUnit', 'crewSize', 'engineerManHoursPerUnit', 'estimateId',
      'manHoursPerUnit', 'projectManagerManHoursPerUnit',
    ]);
    // The hourly rate priced into this line was 30/h. Not one number here is it, or derived from it.
    expect(Object.entries(basis ?? {}).filter(([, value]) => typeof value === 'number' && value === 30)).toEqual([]);
  });

  it('reads the sold quantity and the priced rate onto the activity, with nobody entering either', async () => {
    const output = await outputOf(pricedTaskId);
    expect(output).toMatchObject({
      plannedQuantity: 200,
      unit: 'm2',
      pricedRatePerDay: 16,
      pricedCrewDays: 12.5, // 200 ÷ 16
      installedQuantity: 0,
    });
  });

  it('calls the work behind when it is going slower than it was sold to go', async () => {
    await install(60, 'Riser L1');
    const output = await until(async () => {
      const current = await outputOf(pricedTaskId);
      return current.installedQuantity === 60 ? current : null;
    });
    // Ten of twenty days used. At the priced 16/day, 160 m² should be in; 60 is 6/day.
    expect(output).toMatchObject({ verdict: 'BEHIND', achievedRatePerDay: 6, expectedByNow: 160 });
    // …and what it would now take to still finish inside the window: 140 left over 10 days.
    expect(output!.requiredRatePerDay).toBe(14);
    expect(output!.unknownReason).toBeNull();
  });

  it('agrees the work is on rate once it catches up, without demanding precision it cannot measure', async () => {
    await install(100, 'Riser L2-L4');
    const output = await until(async () => {
      const current = await outputOf(pricedTaskId);
      return current.installedQuantity === 160 ? current : null;
    });
    expect(output).toMatchObject({ verdict: 'ON_RATE', achievedRatePerDay: 16 });
  });

  it('says nothing about a work package with no award line behind it', async () => {
    // Most activities look like this, and the honest answer is that nothing was sold or priced for
    // them — not that they are on time.
    const output = await outputOf(unmappedTaskId);
    expect(output).toMatchObject({ verdict: 'UNKNOWN', plannedQuantity: null, pricedRatePerDay: null });
    expect(output.unknownReason).toMatch(/no award line/);
  });

  // ── What the installed work COST in hours ────────────────────────────────
  // A separate question from the pace, with its own verdict: a crew can be behind the programme
  // and perfectly efficient (too few people), or ahead of it and ruinous (far too many).

  it('does not call a package with no hours written down infinitely productive', async () => {
    // 160 m² installed at 1 priced man-hour each — 160 hours EARNED, and not one hour recorded
    // against the package. The honest answer is that nobody wrote down where the time went.
    const output = await outputOf(pricedTaskId);
    expect(output.labour).toMatchObject({ verdict: 'UNKNOWN', spentManHours: 0, earnedManHours: 160, factor: null });
    expect(output.labour.unknownReason).toMatch(/no labour has been attributed/);
  });

  it('refuses hours attributed to a work package in another project', async () => {
    const elsewhere = (await http.post('/api/v1/projects/projects').send({ title: 'Another job' }).expect(201)).body;
    const foreignNode = (await http.post('/api/v1/projects/wbs').send({
      projectId: elsewhere.id, code: '9.9', title: 'Somebody else’s package', plannedValue: 1_000,
    }).expect(201)).body;
    // Refused at the point of writing: the alternative is hours quietly attributed to another
    // project's package, wrong in two places at once and discovered by neither.
    const refused = await http.post('/api/v1/site/labour').send({
      projectId, date: day(0), trade: 'Electrician', headcount: 4, hours: 8, wbsNodeId: foreignNode.id,
    });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/does not belong to project/);
  });

  it('sets the hours spent against the hours the installed work earned', async () => {
    // 40 electricians × 8 hours = 320 man-hours on the package, against 160 earned: factor 0.5.
    await http.post('/api/v1/site/labour').send({
      projectId, date: day(0), trade: 'Electrician', headcount: 40, hours: 8, wbsNodeId,
    }).expect(201);
    const output = await outputOf(pricedTaskId);
    expect(output.labour).toMatchObject({
      verdict: 'WORSE_THAN_PRICED', spentManHours: 320, earnedManHours: 160, factor: 0.5,
    });
    // The pace verdict is untouched by any of this — two questions, two answers.
    expect(output.verdict).toBe('ON_RATE');
  });

  it('keeps hours that name no package out of the figure, and says how many there are', async () => {
    // Mobilisation and standing time: real hours on this project belonging to no one package.
    await http.post('/api/v1/site/labour').send({
      projectId, date: day(0), trade: 'General', headcount: 10, hours: 8,
    }).expect(201);
    const output = await outputOf(pricedTaskId);
    // Not added to the package — that would flatter nothing and distort everything.
    expect(output.labour.spentManHours).toBe(320);
    // …but never hidden either: 80 of the project's 400 hours name no package.
    expect(output.labour).toMatchObject({ unattributedManHours: 80, unattributedShare: 0.2 });
  });

  it('keeps the rate out of the plan itself — it is derived on the read, never stored', async () => {
    const plan = (await http.get(`/api/v1/projects/schedules?projectId=${projectId}`).expect(200)).body as Array<{
      tasks: Array<Record<string, unknown>>;
    }>;
    // Nothing about the rate, the sold quantity or the verdict is written onto the activity: a
    // stored "BEHIND" would be behind as of the last refresh, which is the defect §22 keeps out.
    for (const task of plan[0].tasks) {
      for (const key of Object.keys(task)) expect(key).not.toMatch(/priced|verdict|plannedQuantity|achievedRate/i);
    }
  });
});

describe('an award line nobody priced a crew for (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    // The same filter main.ts installs, so a domain refusal reaches this spec as the status the
    // running API would give it rather than as an unclassified 500.
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);
    const localTenant = `${TENANT}-unpriced`;
    for (const userId of ['qty-maker', 'qty-checker']) {
      access.grant({ userId, roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: localTenant }, approvalLimit: 1_000_000 });
      users.save({ tenantId: localTenant, userId, displayName: userId, active: true });
    }
    app.use((req: { headers?: Record<string, string> }, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: localTenant, companyId: null, actorId: req.headers?.['x-e2e-actor'] ?? 'qty-maker', correlationId: 'e2e-unpriced' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());

    // No `labour`: the line is priced as raw material components, the way a fully subcontracted or
    // supply-only line is. Nothing about crew or hours exists to freeze.
    const fixture = await createGovernedDeliveryFixture(
      http, app.get(QuantityLedgerService), 'Supply', 100, 'nr', localTenant);
    await http.post('/api/v1/projects/schedules').send({
      projectId: fixture.project.id,
      tasks: [{ wbsNodeId: fixture.wbs.id, name: 'Deliver panels', plannedStart: day(-9), plannedEnd: day(10) }],
    }).expect(201);
    await http.post('/api/v1/site/installations')
      .send({ projectId: fixture.project.id, boqItemId: fixture.boqItemId, date: day(0), description: 'Panels', quantity: 30, unit: 'nr' }).expect(201);
  });

  afterAll(async () => { await app?.close(); });

  it('refuses to judge an achieved rate against a rate nobody committed to', async () => {
    const plan = (await http.get('/api/v1/projects/schedules').expect(200)).body as Array<{ output: Record<string, PlannedOutput> }>;
    const output = Object.values(plan[0].output)[0];
    // Everything knowable is still reported — what was sold, what is in, the pace it is going at.
    expect(output).toMatchObject({ plannedQuantity: 100, installedQuantity: 30, pricedRatePerDay: null, basis: null });
    // But there is no committed rate to be behind, and the system does not invent one.
    expect(output.verdict).toBe('UNKNOWN');
    expect(output.unknownReason).toMatch(/no crew was priced/);
  });
});
