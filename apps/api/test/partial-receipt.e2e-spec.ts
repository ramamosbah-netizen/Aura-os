// AURA OS — BUY-05: receive 1 of 100, and 99 are still outstanding.
//
// The register records the defect in one sentence: "partial receipt marks full order received."
// Wave 4 iteration 2 CONTAINED it — an unknown quantity stopped declaring completion — but could
// not produce the true answer, because the order had one scalar quantity and no items, so "99 still
// outstanding" had nothing to be outstanding ON.
//
// This is the real answer, and it is per line by necessity. An order for twelve cameras and 250
// metres of cable is not fractionally received: it is a set of positions, each settled or still
// owed, and the order is finished only when every one of them is settled. An order-level percentage
// would say "most of it" and leave nobody able to tell which material to chase.
//
// ACCEPTED IS NOT DELIVERED. A rejected quantity arrived, was inspected and was sent back. Real,
// worth recording — and not progress, because the material is still owed.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `partial-receipt-${Date.now()}`;

interface Material { id: string; code: string }
interface OrderLine { id: string; lineNo: number; materialCode: string; quantity: number; uom: string }
interface Order { id: string; status: string; value: number }

/** The reactor runs off the outbox, so the order's status settles a moment after the receipt. */
async function eventually<T>(read: () => Promise<T>, until: (v: T) => boolean, tries = 40): Promise<T> {
  let last = await read();
  for (let i = 0; i < tries && !until(last); i++) {
    await new Promise((r) => setTimeout(r, 50));
    last = await read();
  }
  return last;
}

describe('a purchase order is received when every line is (JWT ON)', () => {
  let app: INestApplication;
  let store: ReturnType<typeof request.agent>;
  let buyer: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;
  let projectId: string;
  let camera: Material;
  let cable: Material;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'partial-receipt-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    access.registerRole({
      id: 'r-e2e-pr-store', name: 'Storekeeper (e2e)',
      // Receives goods and maintains the catalogue; reads procurement, never writes an order.
      permissions: ['inventory.*', 'procurement.*.read', 'procurement.po.view', 'projects.project.read'],
    });
    access.registerRole({
      id: 'r-e2e-pr-buyer', name: 'Buyer (e2e)',
      permissions: [
        'inventory.*.read', 'procurement.*.read', 'procurement.*.create', 'procurement.*.update',
        'procurement.po.view', 'procurement.po.create', 'procurement.po.update', 'projects.project.read',
      ],
    });
    access.grant({ userId: 'pr-store', roleId: 'r-e2e-pr-store', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'pr-buyer', roleId: 'r-e2e-pr-buyer', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'pr-admin', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 10_000_000 });
    for (const userId of ['pr-store', 'pr-buyer', 'pr-admin']) {
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
    store = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'pr-store', tenantId: TENANT })}`);
    buyer = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'pr-buyer', tenantId: TENANT })}`);
    admin = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'pr-admin', tenantId: TENANT })}`);

    projectId = (await admin.post('/api/v1/projects/projects').send({ title: 'Receipt job' }).expect(201)).body.id;
    const run = Date.now().toString().slice(-6);
    camera = (await store.post('/api/v1/inventory/materials')
      .send({ code: `RCAM-${run}`, name: '4MP dome camera', uom: 'nr' }).expect(201)).body;
    cable = (await store.post('/api/v1/inventory/materials')
      .send({ code: `RCBL-${run}`, name: 'Cat6 U/UTP cable', uom: 'm' }).expect(201)).body;
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  /** An ISSUED order with the given lines — the state goods are actually received against. */
  async function issuedOrder(lines: Array<{ material: string; quantity: number; unitPrice: number }>) {
    const poId = (await buyer.post('/api/v1/procurement/purchase-orders')
      .send({ title: `Order ${Date.now()}`, projectId, value: 0 }).expect(201)).body.id;
    for (const l of lines) {
      await buyer.post(`/api/v1/procurement/purchase-orders/${poId}/lines`).send(l).expect(201);
    }
    await admin.patch(`/api/v1/procurement/purchase-orders/${poId}/status`).send({ status: 'issued' }).expect(200);
    const authored = (await buyer.get(`/api/v1/procurement/purchase-orders/${poId}/lines`).expect(200)).body as OrderLine[];
    return { poId, lines: authored };
  }

  /** A goods receipt against the order, with a line per position received. */
  async function receive(poId: string, entries: Array<{ poLineId: string; quantityAccepted?: number; quantityRejected?: number; rejectionReason?: string }>) {
    const grnId = (await store.post('/api/v1/inventory/grns')
      .send({ title: `GRN ${Date.now()}`, poId, poTitle: 'Order', projectId }).expect(201)).body.id;
    for (const e of entries) {
      await store.post(`/api/v1/inventory/grns/${grnId}/lines`).send(e).expect(201);
    }
    return grnId;
  }

  const orderOf = async (poId: string): Promise<Order> =>
    (await buyer.get(`/api/v1/procurement/purchase-orders/${poId}`).expect(200)).body as Order;

  // ── THE DEFECT THE REGISTER RECORDS ────────────────────────────────────────

  it('RECEIVES 1 OF 100 AND LEAVES 99 OUTSTANDING — the order is NOT received', async () => {
    const { poId, lines } = await issuedOrder([{ material: camera.code, quantity: 100, unitPrice: 10 }]);
    expect((await orderOf(poId)).status).toBe('issued');

    await receive(poId, [{ poLineId: lines[0].id, quantityAccepted: 1 }]);

    const settled = await eventually(() => orderOf(poId), (o) => o.status !== 'issued');
    // The one fact the whole capability turns on.
    expect(settled.status).toBe('partially_received');
    expect(settled.status).not.toBe('received');
  });

  it('completes only when the last of it arrives', async () => {
    const { poId, lines } = await issuedOrder([{ material: camera.code, quantity: 100, unitPrice: 10 }]);
    await receive(poId, [{ poLineId: lines[0].id, quantityAccepted: 1 }]);
    await eventually(() => orderOf(poId), (o) => o.status === 'partially_received');

    // A second delivery of the remaining 99 — cumulative across notes, not per note.
    await receive(poId, [{ poLineId: lines[0].id, quantityAccepted: 99 }]);
    expect((await eventually(() => orderOf(poId), (o) => o.status === 'received')).status).toBe('received');
  });

  // ── An order is a set of positions ─────────────────────────────────────────

  it('will not call an order received while ANOTHER line is still owed', async () => {
    const { poId, lines } = await issuedOrder([
      { material: camera.code, quantity: 12, unitPrice: 200 },
      { material: cable.code, quantity: 250, unitPrice: 2 },
    ]);

    // Every camera arrives; not one metre of cable does.
    await receive(poId, [{ poLineId: lines[0].id, quantityAccepted: 12 }]);

    const after = await eventually(() => orderOf(poId), (o) => o.status !== 'issued');
    expect(after.status).toBe('partially_received');

    // The cable arrives later, and only then is the order finished.
    await receive(poId, [{ poLineId: lines[1].id, quantityAccepted: 250 }]);
    expect((await eventually(() => orderOf(poId), (o) => o.status === 'received')).status).toBe('received');
  });

  // ── Accepted is not delivered ──────────────────────────────────────────────

  it('does NOT count a rejected delivery as progress — the material is still owed', async () => {
    const { poId, lines } = await issuedOrder([{ material: camera.code, quantity: 100, unitPrice: 10 }]);

    // A hundred arrived and every one was rejected. Something happened; nothing was delivered.
    await receive(poId, [{ poLineId: lines[0].id, quantityRejected: 100, rejectionReason: 'wrong model shipped' }]);

    // Given the reactor the same room a passing case gets, the order has NOT moved.
    const after = await eventually(() => orderOf(poId), (o) => o.status !== 'issued', 12);
    expect(after.status).toBe('issued');
  });

  it('counts only the accepted part of a part-rejected delivery', async () => {
    const { poId, lines } = await issuedOrder([{ material: camera.code, quantity: 100, unitPrice: 10 }]);
    await receive(poId, [{ poLineId: lines[0].id, quantityAccepted: 40, quantityRejected: 10, rejectionReason: 'ten damaged in transit' }]);

    const after = await eventually(() => orderOf(poId), (o) => o.status !== 'issued');
    // 40 accepted of 100 — partial. The 10 rejected are not 50/100.
    expect(after.status).toBe('partially_received');
  });

  it('refuses a rejection nobody explained', async () => {
    const { poId, lines } = await issuedOrder([{ material: camera.code, quantity: 10, unitPrice: 1 }]);
    const grnId = (await store.post('/api/v1/inventory/grns')
      .send({ title: 'GRN unexplained', poId, projectId }).expect(201)).body.id;
    const refused = await store.post(`/api/v1/inventory/grns/${grnId}/lines`)
      .send({ poLineId: lines[0].id, quantityRejected: 5 }).expect(400);
    expect(refused.body.message).toMatch(/rejected quantity requires a reason/);
  });

  it('refuses a receipt line that records nothing arriving, and one against no order line', async () => {
    const { poId, lines } = await issuedOrder([{ material: camera.code, quantity: 10, unitPrice: 1 }]);
    const grnId = (await store.post('/api/v1/inventory/grns')
      .send({ title: 'GRN empty', poId, projectId }).expect(201)).body.id;

    const nothing = await store.post(`/api/v1/inventory/grns/${grnId}/lines`)
      .send({ poLineId: lines[0].id, quantityAccepted: 0 }).expect(400);
    expect(nothing.body.message).toMatch(/requires something to have arrived/);

    await store.post(`/api/v1/inventory/grns/${grnId}/lines`).send({ quantityAccepted: 1 }).expect(400);
  });

  // ── What cannot be concluded ───────────────────────────────────────────────

  it('leaves a LEGACY order — one with no lines — exactly where it is', async () => {
    // No positions to measure. That is unanswerable, not "nothing arrived", and the containment
    // from iteration 2 still refuses to conclude completion from it.
    const poId = (await buyer.post('/api/v1/procurement/purchase-orders')
      .send({ title: `Legacy ${Date.now()}`, projectId, value: 900 }).expect(201)).body.id;
    await admin.patch(`/api/v1/procurement/purchase-orders/${poId}/status`).send({ status: 'issued' }).expect(200);

    await store.post('/api/v1/inventory/grns')
      .send({ title: 'GRN against a headerless order', poId, projectId, value: 900 }).expect(201);

    const after = await eventually(() => orderOf(poId), (o) => o.status !== 'issued', 12);
    expect(after.status).toBe('issued');
  });

  it('refuses an unauthenticated caller outright', async () => {
    await request(app.getHttpServer()).get('/api/v1/inventory/grns/whatever/lines').expect(401);
  });
});
