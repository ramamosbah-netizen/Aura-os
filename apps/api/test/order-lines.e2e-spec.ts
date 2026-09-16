// AURA OS — Wave 4 slice 2: a purchase order buys MATERIALS, and says how it came to buy them.
//
// An order was a header with one scalar value, so "what did we order" had no answer — and every
// question downstream of it (receive part of this delivery, issue some of it to site, prove the
// material installed is the one approved) had no subject to attach to.
//
// Two things are proven here, and they are different in kind:
//
//   · THE ORDINARY ONE — an order has lines, each naming a canonical material with its own unit and
//     its description copied at authoring time, and the order's value is what they add up to;
//
//   · THE ONE THAT MATTERS — how a line came to be bought is STATED, never inferred. A line saying
//     it was bought direct is making an explicit statement, and its empty source chain is that
//     statement rather than a gap. A line CLAIMING to have been competitively sourced without the
//     chain behind it is refused. Same NULL, opposite meanings, because a discriminator says which.
//
// And the first real handoff in the chain: an approved requisition's lines travel onto the order it
// drafts, without anybody retyping a description.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `order-lines-${Date.now()}`;

interface Material { id: string; code: string }
interface OrderLine {
  id: string; lineNo: number; materialId: string; materialCode: string; materialName: string;
  specification: string | null; manufacturer: string | null; model: string | null; uom: string;
  quantity: number; unitPrice: number;
  sourceType: 'direct' | 'sourced'; sourcePrLineId: string | null; sourceQuoteLineId: string | null;
}
interface OrderSummary {
  total: { lineCount: number; value: number };
  provenance: 'legacy' | 'direct' | 'sourced' | 'mixed';
  derived: boolean;
}

describe('a purchase order buys materials, and says how it came to buy them (JWT ON)', () => {
  let app: INestApplication;
  let store: ReturnType<typeof request.agent>;
  let buyer: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;
  let projectId: string;
  let camera: Material;
  let cable: Material;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'order-lines-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    access.registerRole({
      id: 'r-e2e-ol-store', name: 'Storekeeper (e2e)',
      permissions: ['inventory.*', 'procurement.*.read', 'procurement.po.view', 'projects.project.read'],
    });
    access.registerRole({
      id: 'r-e2e-ol-buyer', name: 'Buyer (e2e)',
      permissions: [
        'inventory.*.read', 'procurement.*.read', 'procurement.*.create', 'procurement.*.update',
        'procurement.po.view', 'procurement.po.create', 'procurement.po.update', 'projects.project.read',
      ],
    });
    access.grant({ userId: 'ol-store', roleId: 'r-e2e-ol-store', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'ol-buyer', roleId: 'r-e2e-ol-buyer', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'ol-admin', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 10_000_000 });
    for (const userId of ['ol-store', 'ol-buyer', 'ol-admin']) {
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
    store = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'ol-store', tenantId: TENANT })}`);
    buyer = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'ol-buyer', tenantId: TENANT })}`);
    admin = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'ol-admin', tenantId: TENANT })}`);

    projectId = (await admin.post('/api/v1/projects/projects').send({ title: 'Order job' }).expect(201)).body.id;
    const run = Date.now().toString().slice(-6);
    camera = (await store.post('/api/v1/inventory/materials').send({
      code: `OCAM-${run}`, name: '4MP dome camera', uom: 'nr',
      specification: 'IP67, 2.8mm fixed lens', manufacturer: 'Hikvision', model: 'DS-2CD2143G2-I',
    }).expect(201)).body;
    cable = (await store.post('/api/v1/inventory/materials').send({
      code: `OCBL-${run}`, name: 'Cat6 U/UTP cable', uom: 'm',
    }).expect(201)).body;
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  const newOrder = async (value = 0): Promise<string> =>
    (await buyer.post('/api/v1/procurement/purchase-orders')
      .send({ title: `Order ${Date.now()}`, projectId, value }).expect(201)).body.id;

  const summaryOf = async (poId: string): Promise<OrderSummary> =>
    (await buyer.get(`/api/v1/procurement/purchase-orders/${poId}/lines/summary`).expect(200)).body as OrderSummary;

  // ── The line itself ─────────────────────────────────────────────────────────

  it('buys a material in that material’s own unit, with its description copied', async () => {
    const poId = await newOrder();
    const line = (await buyer.post(`/api/v1/procurement/purchase-orders/${poId}/lines`)
      .send({ material: cable.code, quantity: 250, unitPrice: 4 }).expect(201)).body as OrderLine;

    expect(line).toMatchObject({
      lineNo: 1, materialId: cable.id, materialCode: cable.code, materialName: 'Cat6 U/UTP cable',
      uom: 'm', quantity: 250, unitPrice: 4,
    });
  });

  it('derives the order value from its lines, and the header stops speaking', async () => {
    // The header was authored at 999,999 and the lines say 6,400. The lines win, because they can
    // be checked; a total nobody can reconcile to the page is not a total.
    const poId = await newOrder(999_999);
    await buyer.post(`/api/v1/procurement/purchase-orders/${poId}/lines`)
      .send({ material: camera.code, quantity: 12, unitPrice: 450 }).expect(201);
    await buyer.post(`/api/v1/procurement/purchase-orders/${poId}/lines`)
      .send({ material: cable.code, quantity: 250, unitPrice: 4 }).expect(201);

    expect(await summaryOf(poId)).toMatchObject({
      total: { lineCount: 2, value: 6400 }, provenance: 'direct', derived: true,
    });
    expect((await buyer.get(`/api/v1/procurement/purchase-orders/${poId}`).expect(200)).body.value).toBe(6400);
  });

  it('leaves a LEGACY order — one with no lines — reading its own authored value', async () => {
    const poId = await newOrder(7500);
    const summary = await summaryOf(poId);
    // Not "direct": a historical order is not evidence that nobody sourced it.
    expect(summary).toMatchObject({ provenance: 'legacy', derived: false, total: { lineCount: 0 } });
    expect((await buyer.get(`/api/v1/procurement/purchase-orders/${poId}`).expect(200)).body.value).toBe(7500);
  });

  // ── How it came to be bought ────────────────────────────────────────────────

  it('REFUSES a line claiming it was competitively sourced with no chain behind it', async () => {
    const poId = await newOrder();
    const refused = await buyer.post(`/api/v1/procurement/purchase-orders/${poId}/lines`)
      .send({ material: camera.code, quantity: 1, unitPrice: 1, sourceType: 'sourced' }).expect(400);
    expect(refused.body.message).toMatch(/cannot claim it was competitively sourced/);
    expect((await buyer.get(`/api/v1/procurement/purchase-orders/${poId}/lines`).expect(200)).body).toHaveLength(0);
  });

  it('refuses LEGACY as a lineage a caller may choose', async () => {
    const poId = await newOrder();
    // Rejected by the DTO before it reaches the domain, and by the domain by name if it ever did.
    await buyer.post(`/api/v1/procurement/purchase-orders/${poId}/lines`)
      .send({ material: camera.code, quantity: 1, unitPrice: 1, sourceType: 'legacy' }).expect(400);
  });

  it('refuses a citation of a requisition line that does not exist', async () => {
    const poId = await newOrder();
    const refused = await buyer.post(`/api/v1/procurement/purchase-orders/${poId}/lines`)
      .send({ material: camera.code, quantity: 1, unitPrice: 1, sourcePrLineId: '11111111-1111-4111-8111-111111111111' })
      .expect(404);
    expect(refused.body.message).toMatch(/requisition line .* not found/);
  });

  // ── The handoff: a requisition's lines travel onto the order it drafts ──────

  it('CARRIES AN APPROVED REQUISITION’S LINES ONTO ITS ORDER, without retyping', async () => {
    const prId = (await buyer.post('/api/v1/procurement/purchase-requests')
      .send({ title: `Containment ${Date.now()}`, projectId, value: 0 }).expect(201)).body.id;
    await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: camera.code, quantity: 12, estimatedUnitCost: 450 }).expect(201);
    await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: cable.code, quantity: 250, estimatedUnitCost: 4 }).expect(201);

    const demand = (await buyer.get(`/api/v1/procurement/purchase-requests/${prId}/lines`).expect(200)).body as Array<{ id: string }>;

    await buyer.patch(`/api/v1/procurement/purchase-requests/${prId}/status`).send({ status: 'submitted' }).expect(200);
    await admin.patch(`/api/v1/procurement/purchase-requests/${prId}/status`).send({ status: 'approved' }).expect(200);

    const orders = (await buyer.get('/api/v1/procurement/purchase-orders').expect(200)).body as Array<{ id: string; title: string; value: number }>;
    const drafted = orders.find((o) => o.title.includes('Containment'));
    expect(drafted, 'approving a requisition should draft an order').toBeDefined();

    const lines = (await buyer.get(`/api/v1/procurement/purchase-orders/${drafted!.id}/lines`).expect(200)).body as OrderLine[];
    expect(lines).toHaveLength(2);

    // The material identity, the description as the requisitioner saw it, the quantity and the unit
    // all travelled. Nobody retyped anything.
    expect(lines[0]).toMatchObject({
      materialId: camera.id, materialCode: camera.code, materialName: '4MP dome camera',
      specification: 'IP67, 2.8mm fixed lens', model: 'DS-2CD2143G2-I',
      uom: 'nr', quantity: 12, unitPrice: 450,
    });
    expect(lines[1]).toMatchObject({ materialCode: cable.code, uom: 'm', quantity: 250, unitPrice: 4 });

    // Each order line records the demand it answers…
    expect(lines.map((l) => l.sourcePrLineId)).toEqual(demand.map((d) => d.id));
    // …and the lineage is DIRECT, said plainly: a requisition is demand, not sourcing. Nothing here
    // was quoted, compared or selected, and the order does not pretend otherwise.
    const summary = await summaryOf(drafted!.id);
    expect(summary.provenance).toBe('direct');
    // Both sides derive the total the same way, so they agree without anybody reconciling them.
    expect(summary.total.value).toBe(6400);
    expect(drafted!.value).toBe(6400);
  });

  // ── Frozen once committed ───────────────────────────────────────────────────

  it('freezes the lines once the order has left draft', async () => {
    const poId = await newOrder();
    const line = (await buyer.post(`/api/v1/procurement/purchase-orders/${poId}/lines`)
      .send({ material: camera.code, quantity: 4, unitPrice: 450 }).expect(201)).body as OrderLine;

    await admin.patch(`/api/v1/procurement/purchase-orders/${poId}/status`).send({ status: 'issued' }).expect(200);

    // After issue these lines are what the supplier was told to deliver — and what a receipt will
    // be measured against.
    await buyer.post(`/api/v1/procurement/purchase-orders/${poId}/lines`)
      .send({ material: cable.code, quantity: 1, unitPrice: 1 }).expect(409);
    await buyer.patch(`/api/v1/procurement/purchase-orders/${poId}/lines/${line.id}`)
      .send({ quantity: 4000 }).expect(409);
    await buyer.delete(`/api/v1/procurement/purchase-orders/${poId}/lines/${line.id}`).expect(409);

    const still = (await buyer.get(`/api/v1/procurement/purchase-orders/${poId}/lines`).expect(200)).body as OrderLine[];
    expect(still).toHaveLength(1);
    expect(still[0].quantity).toBe(4);
  });

  it('refuses an unauthenticated caller outright', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/procurement/purchase-orders/whatever/lines').expect(401);
  });
});
