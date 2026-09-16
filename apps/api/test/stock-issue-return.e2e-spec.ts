// AURA OS — BUY-06: issue 20, return 5, retry both; net issued remains 15.
//
// That sentence is the frozen acceptance proof, and it has two halves that fail differently.
//
// THE NET. Material issued to a project can come back, and what is on site is issues minus
// returns. The existing quantity-ledger proof already showed 20 − 5 = 15; what it did not show is
// what happens when the arithmetic is pushed past what is physically possible. Measured against
// the running system before this slice: issue 20, return 50, and the BOQ item read
//
//     issued −30 · onSite 30 · wastage −30
//
// Nothing refused it. "We have sent minus thirty metres to site" is not a fact, and progress,
// wastage and remaining-to-order all read from that position.
//
// THE RETRY. A redelivered movement must not be counted twice — the ledger post is keyed on the
// persisted movement id, so replaying both the issue and the return leaves the net exactly where
// it was.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, EVENT_STORE, type EventStore, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `issue-return-${Date.now()}`;

interface Position { boqItemId: string; issued: number; onSite: number; wastage: number; unit: string | null }

async function settlesAt<T>(read: () => Promise<T>, want: (v: T) => boolean, tries = 40): Promise<T> {
  let last = await read();
  for (let i = 0; i < tries && !want(last); i++) {
    await new Promise((r) => setTimeout(r, 50));
    last = await read();
  }
  return last;
}

describe('stock issued to a project, and what comes back (JWT ON)', () => {
  let app: INestApplication;
  let store: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;
  let events: EventStore;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'issue-return-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);
    events = app.get(EVENT_STORE);

    access.registerRole({
      id: 'r-e2e-ir-store', name: 'Storekeeper (e2e)',
      permissions: ['inventory.*', 'projects.project.read', 'projects.*.read'],
    });
    access.grant({ userId: 'ir-store', roleId: 'r-e2e-ir-store', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'ir-admin', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 10_000_000 });
    for (const userId of ['ir-store', 'ir-admin']) {
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }

    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    expect(auth.enabled).toBe(true);

    const server = app.getHttpServer();
    store = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'ir-store', tenantId: TENANT })}`);
    admin = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'ir-admin', tenantId: TENANT })}`);
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  /** A project with a BOQ target, and stock on hand to issue from. */
  async function scene(boqQty = 100, onHand = 100) {
    const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const project = (await admin.post('/api/v1/projects/projects').send({ title: `Issue job ${run}` }).expect(201)).body;
    const boqItemId = `boq-ir-${run}`;
    await admin.post('/api/v1/projects/quantity-ledger/baseline')
      .send({ projectId: project.id, boqItemId, quantity: boqQty, unit: 'm' }).expect(201);
    const item = (await store.post('/api/v1/inventory/stock')
      .send({ code: `IR-${run}`, name: '2.5mm² cable', unit: 'm', openingQty: onHand, openingCost: 5 }).expect(201)).body;
    return { projectId: project.id, boqItemId, itemId: item.id as string };
  }

  const move = (itemId: string, body: Record<string, unknown>) =>
    store.post(`/api/v1/inventory/stock/${itemId}/movements`).send(body);

  const position = async (boqItemId: string): Promise<Position> =>
    (await admin.get(`/api/v1/projects/quantity-ledger/position/${boqItemId}`).expect(200)).body as Position;

  // ── The frozen sentence ────────────────────────────────────────────────────

  it('ISSUES 20, RETURNS 5, AND THE NET ON SITE IS 15', async () => {
    const { projectId, boqItemId, itemId } = await scene();

    await move(itemId, { direction: 'out', quantity: 20, projectId, boqItemId }).expect(201);
    expect((await settlesAt(() => position(boqItemId), (p) => p.issued === 20)).issued).toBe(20);

    await move(itemId, { direction: 'in', quantity: 5, unitCost: 5, projectId, boqItemId }).expect(201);
    const net = await settlesAt(() => position(boqItemId), (p) => p.issued === 15);
    expect(net.issued).toBe(15);
    // `onSite` is NOT asserted here: it means received − issued (delivered to site and not yet
    // issued), so warehouse-issued material legitimately makes it negative. That is this position's
    // own definition, not a defect, and BUY-06's clause is the net issued.
  });

  it('RETRIES BOTH — a redelivered issue and return leave the net exactly where it was', async () => {
    const { projectId, boqItemId, itemId } = await scene();
    await move(itemId, { direction: 'out', quantity: 20, projectId, boqItemId }).expect(201);
    await settlesAt(() => position(boqItemId), (p) => p.issued === 20);
    await move(itemId, { direction: 'in', quantity: 5, unitCost: 5, projectId, boqItemId }).expect(201);
    await settlesAt(() => position(boqItemId), (p) => p.issued === 15);

    // Replay BOTH movements onto the spine exactly as the relay would after a failure. The ledger
    // post is keyed on the persisted movement id, so a second delivery of the same business fact
    // finds the transaction already there rather than adding another.
    const movements = (await store.get(`/api/v1/inventory/stock/${itemId}`).expect(200)).body.movements as Array<{
      id: string; direction: 'in' | 'out'; quantity: number;
    }>;
    expect(movements).toHaveLength(2);
    for (const m of movements) {
      await events.append([{
        id: `replay-${m.id}`,
        type: 'inventory.stock.movement_recorded',
        tenantId: TENANT,
        companyId: null,
        actorId: null,
        aggregateType: 'inventory.stock',
        aggregateId: itemId,
        occurredAt: new Date().toISOString(),
        payload: {
          movementId: m.id, code: 'IR', name: 'cable', unit: 'm',
          direction: m.direction, quantity: m.quantity,
          projectId, boqItemId, cbsNodeId: null,
        },
      } as never]);
    }

    // Give the relay the same room a passing case gets, then assert nothing moved.
    await new Promise((r) => setTimeout(r, 1_500));
    expect((await position(boqItemId)).issued).toBe(15);
  });

  // ── You cannot return more than you took ───────────────────────────────────

  it('REFUSES a return larger than what is currently issued, and says how much is out', async () => {
    const { projectId, boqItemId, itemId } = await scene();
    await move(itemId, { direction: 'out', quantity: 20, projectId, boqItemId }).expect(201);
    await settlesAt(() => position(boqItemId), (p) => p.issued === 20);

    const refused = await move(itemId, { direction: 'in', quantity: 50, unitCost: 5, projectId, boqItemId }).expect(409);
    expect(refused.body.message).toMatch(/only 20 of this material is currently issued/);
    expect(refused.body.message).toMatch(/cannot return more than you took/);

    // The position is untouched — no negative issued, no phantom stock on site.
    const after = await position(boqItemId);
    expect(after.issued).toBe(20);
    // No negative issued, and therefore no negative wastage reading off it.
    expect(after.wastage).toBeGreaterThanOrEqual(0);
  });

  it('measures the refusal against the NET, not the gross', async () => {
    const { projectId, boqItemId, itemId } = await scene();
    await move(itemId, { direction: 'out', quantity: 20, projectId, boqItemId }).expect(201);
    await settlesAt(() => position(boqItemId), (p) => p.issued === 20);
    await move(itemId, { direction: 'in', quantity: 5, unitCost: 5, projectId, boqItemId }).expect(201);
    await settlesAt(() => position(boqItemId), (p) => p.issued === 15);

    // 20 went out and 5 came back, so 15 are out there — returning 16 returns material that is
    // no longer on site, even though 20 were issued in total.
    await move(itemId, { direction: 'in', quantity: 16, unitCost: 5, projectId, boqItemId }).expect(409);
    await move(itemId, { direction: 'in', quantity: 15, unitCost: 5, projectId, boqItemId }).expect(201);
    expect((await settlesAt(() => position(boqItemId), (p) => p.issued === 0)).issued).toBe(0);
  });

  it('refuses a return against a project that was never issued this material', async () => {
    const { projectId, boqItemId, itemId } = await scene();
    const refused = await move(itemId, { direction: 'in', quantity: 1, unitCost: 5, projectId, boqItemId }).expect(409);
    expect(refused.body.message).toMatch(/nothing of this material is currently issued/);
  });

  it('leaves an UNCODED warehouse receipt alone — it has no issued balance to measure against', async () => {
    const { itemId } = await scene();
    // A delivery into the warehouse is not a return from a project, and the rule does not apply.
    await move(itemId, { direction: 'in', quantity: 500, unitCost: 5 }).expect(201);
    const item = (await store.get(`/api/v1/inventory/stock/${itemId}`).expect(200)).body.item as { quantityOnHand: number };
    expect(item.quantityOnHand).toBe(600);
  });

  it('refuses an unauthenticated caller outright', async () => {
    await request(app.getHttpServer()).post('/api/v1/inventory/stock/whatever/movements').send({ direction: 'in', quantity: 1 }).expect(401);
  });
});
