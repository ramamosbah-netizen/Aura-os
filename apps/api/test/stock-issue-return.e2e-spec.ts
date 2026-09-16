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

  /**
   * WHAT A RETURNED QUANTITY IS WORTH.
   *
   * Found by running the operational sequence receipt -> issue -> return on screen, which this
   * capability's frozen acceptance sentence never asked for. A return carries no price and
   * `computeWac` read a missing cost as 0, so material came back valued at NOTHING — the running
   * average fell and inventory value disappeared while on-hand stayed correct, which is why it was
   * silent. A return now re-enters at the item's own running average, resolved on the server.
   */
  it('returns material at the item’s persisted valuation state, so a round trip destroys no value', async () => {
    const { projectId, boqItemId, itemId } = await scene(500, 0);
    const read = async () => (await store.get(`/api/v1/inventory/stock/${itemId}`).expect(200)).body.item as { quantityOnHand: number; avgCost: number };

    // 100 m in at 6.00.
    await move(itemId, { direction: 'in', quantity: 100, unitCost: 6 }).expect(201);
    expect(await read()).toMatchObject({ quantityOnHand: 100, avgCost: 6 });

    // 40 m out to the job — an issue never moves the average.
    await move(itemId, { direction: 'out', quantity: 40, projectId, boqItemId, reason: 'issued to project' }).expect(201);
    expect(await read()).toMatchObject({ quantityOnHand: 60, avgCost: 6 });

    // 15 m back, with NO price sent — the value that used to vanish.
    await move(itemId, { direction: 'in', quantity: 15, projectId, boqItemId, reason: 'returned from project' }).expect(201);
    const after = await read();
    expect(after.quantityOnHand).toBe(75);
    expect(after.avgCost).toBe(6);              // was 4.8
    expect(after.quantityOnHand * after.avgCost).toBe(450);  // was 360 — AED 90 destroyed
  });

  it('still lets an explicit price govern, and leaves an UNCODED receipt priced as sent', async () => {
    const { itemId } = await scene(500, 0);
    const read = async () => (await store.get(`/api/v1/inventory/stock/${itemId}`).expect(200)).body.item as { quantityOnHand: number; avgCost: number };
    await move(itemId, { direction: 'in', quantity: 100, unitCost: 6 }).expect(201);
    // A warehouse receipt is not a return: what it cost is what was paid for it.
    await move(itemId, { direction: 'in', quantity: 100, unitCost: 8 }).expect(201);
    expect(await read()).toMatchObject({ quantityOnHand: 200, avgCost: 7 });
  });

  /**
   * A RETURN CONSUMES THE ITEM'S PERSISTED CURRENT VALUATION STATE — it does not choose a method.
   *
   * Three levels, kept separate: `costingMethod` selects the ENGINE ('wac' | 'fifo'); `avgCost` is
   * the PERSISTED CURRENT VALUATION STATE that engine produced; the return VALUATION consumes that
   * state. "Value a return at the running average" would be inventing policy if it meant WAC for
   * everybody — it does not, because the line reads state rather than method.
   *
   * This item is FIFO, and the case is built so the three answers a cheap implementation might reach
   * are all DIFFERENT — the only way to tell a governed read from a coincidence.
   *
   * NOT asserted here, because it is not modelled: original-layer provenance. The return creates
   * inventory at the current persisted state; it does not reverse the FIFO layer the material was
   * issued from.
   */
  it('values a return on a FIFO item from its persisted valuation state — not the last purchase, not the issue COGS rate', async () => {
    const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const project = (await admin.post('/api/v1/projects/projects').send({ title: `FIFO job ${run}` }).expect(201)).body;
    const boqItemId = `boq-fifo-${run}`;
    await admin.post('/api/v1/projects/quantity-ledger/baseline')
      .send({ projectId: project.id, boqItemId, quantity: 500, unit: 'm' }).expect(201);
    const item = (await store.post('/api/v1/inventory/stock')
      .send({ code: `FIF-${run}`, name: 'FIFO cable', unit: 'm', openingQty: 0, openingCost: 0, costingMethod: 'fifo' })
      .expect(201)).body;
    const read = async () => (await store.get(`/api/v1/inventory/stock/${item.id}`).expect(200)).body.item as { quantityOnHand: number; avgCost: number; costingMethod: string };

    expect((await read()).costingMethod).toBe('fifo');

    // Two layers at different prices, then an issue that consumes only part of the OLDEST one.
    await move(item.id, { direction: 'in', quantity: 100, unitCost: 6 }).expect(201);
    await move(item.id, { direction: 'in', quantity: 100, unitCost: 12 }).expect(201);
    await move(item.id, { direction: 'out', quantity: 50, projectId: project.id, boqItemId, reason: 'issued to project' }).expect(201);

    // Remaining layers are 50 @ 6.00 and 100 @ 12.00 -> 1,500 over 150 = 10.00 persisted state.
    const issued = await read();
    expect(issued.quantityOnHand).toBe(150);
    expect(issued.avgCost).toBe(10);

    // 20 m back, no price sent. The three candidates are 10.00 (persisted current valuation state),
    // 12.00 (last purchase price) and 6.00 (historical issue COGS rate).
    await move(item.id, { direction: 'in', quantity: 20, projectId: project.id, boqItemId, reason: 'returned from project' }).expect(201);
    const returned = await read();
    expect(returned.quantityOnHand).toBe(170);
    expect(returned.avgCost).toBe(10);
    expect(returned.avgCost).not.toBe(12);  // not the last purchase price
    expect(returned.avgCost).not.toBe(6);   // not the historical issue COGS rate
    // 1,500 + 20 × 10.00 = 1,700.
    expect(returned.quantityOnHand * returned.avgCost).toBe(1700);
  });

  /**
   * QUANTITY RECONCILIATION AND VALUATION RECONCILIATION ARE DIFFERENT AUTHORITIES THAT MUST AGREE
   * ON THE SAME MOVEMENT.
   *
   * This is the rule the WAC defect earned. The quantity side was right the whole time — 75 m on
   * hand, 25 m issued, 100 accounted for — and it is exactly that correctness that hid the money
   * being wrong. A green quantity proof is not evidence about value.
   */
  it('makes the quantity position and the value position agree on the same movements', async () => {
    const { projectId, boqItemId, itemId } = await scene(500, 0);
    const read = async () => (await store.get(`/api/v1/inventory/stock/${itemId}`).expect(200)).body.item as { quantityOnHand: number; avgCost: number };

    await move(itemId, { direction: 'in', quantity: 100, unitCost: 6 }).expect(201);
    await move(itemId, { direction: 'out', quantity: 40, projectId, boqItemId, reason: 'issued to project' }).expect(201);
    await move(itemId, { direction: 'in', quantity: 15, projectId, boqItemId, reason: 'returned from project' }).expect(201);

    const item = await read();
    const net = (await position(boqItemId)).issued;

    // QUANTITY: 75 in the warehouse + 25 out on the job = the 100 that arrived. Nothing lost.
    expect(item.quantityOnHand).toBe(75);
    expect(net).toBe(25);
    expect(item.quantityOnHand + net).toBe(100);

    // VALUE: the same 100 units, still at the 6.00 they cost. The warehouse holds 450 and the job
    // is carrying 150 — 600 in total, which is what was received. Before the fix the warehouse said
    // 360 and this identity failed by exactly the 90 that had been destroyed.
    expect(item.quantityOnHand * item.avgCost).toBe(450);
    expect(net * item.avgCost).toBe(150);
    expect(item.quantityOnHand * item.avgCost + net * item.avgCost).toBe(600);
  });

  it('refuses an unauthenticated caller outright', async () => {
    await request(app.getHttpServer()).post('/api/v1/inventory/stock/whatever/movements').send({ direction: 'in', quantity: 1 }).expect(401);
  });
});
