import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * `SUP-01` — the internal technical determination, Auth-ON, JWT on.
 *
 * THE SEPARATION UNDER TEST. The quotation line records what the SUPPLIER says; this records what
 * the COMPANY decided, and only the internal technical authority may decide it. The roles mirror the
 * shipped catalogue rather than being convenient supersets:
 *
 *   Technical Manager  `engineering.*`      — decides. Holds NO procurement permission.
 *   Buyer              `procurement.*`      — records offers, reads eligibility, CANNOT decide.
 *
 * That asymmetry is the point. Governing the decision with a procurement permission would have made
 * it impossible for the role that actually decides.
 */

const TENANT = `tec-${Date.now()}`;

describe('the internal technical verdict on a supplier offer (JWT ON)', () => {
  let app: INestApplication;
  let buyer: ReturnType<typeof request.agent>;
  let techManager: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'technical-evaluation-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    // Mirrors of the shipped roles. The Technical Manager deliberately has no procurement rights,
    // and the Buyer deliberately has no engineering rights.
    access.registerRole({
      id: 'r-e2e-tec-buyer', name: 'Buyer (e2e)',
      permissions: ['procurement.*', 'inventory.*', 'projects.project.read', 'projects.*.read'],
    });
    access.registerRole({
      id: 'r-e2e-tec-manager', name: 'Technical Manager (e2e)', permissions: ['engineering.*'],
    });
    for (const [userId, roleId] of [['tec-buyer', 'r-e2e-tec-buyer'], ['tec-manager', 'r-e2e-tec-manager']]) {
      access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: TENANT } });
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }
    access.grant({ userId: 'tec-admin', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 10_000_000 });
    users.save({ tenantId: TENANT, userId: 'tec-admin', displayName: 'tec-admin', active: true });

    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    expect(auth.enabled).toBe(true);

    const server = app.getHttpServer();
    const agent = (sub: string) => request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub, tenantId: TENANT })}`);
    buyer = agent('tec-buyer');
    techManager = agent('tec-manager');
    admin = agent('tec-admin');
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  /** A requisition line asking for 12 cameras, and a supplier offering against it. */
  async function scene(offered: Record<string, unknown> = {}) {
    const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const project = (await admin.post('/api/v1/projects/projects').send({ title: `Tech ${run}` }).expect(201)).body;
    const camera = (await buyer.post('/api/v1/inventory/materials').send({
      code: `CAM-${run}`, name: '4MP dome camera', uom: 'nr',
      specification: 'IP67, 2.8mm fixed lens', manufacturer: 'Hikvision', model: 'DS-2CD2143G2-I',
    }).expect(201)).body;
    const pr = (await buyer.post('/api/v1/procurement/purchase-requests')
      .send({ title: `Cameras ${run}`, projectId: project.id, value: 0 }).expect(201)).body;
    const prLine = (await buyer.post(`/api/v1/procurement/purchase-requests/${pr.id}/lines`)
      .send({ material: camera.id, quantity: 12, estimatedUnitCost: 450 }).expect(201)).body;
    const rfq = (await buyer.post('/api/v1/procurement/rfqs').send({ title: `RFQ ${run}`, prId: pr.id }).expect(201)).body;
    const quotation = (await buyer.post(`/api/v1/procurement/rfqs/${rfq.id}/quotes`)
      .send({ supplierName: `Supplier ${run}`, amount: 5000, currency: 'AED' }).expect(201)).body;
    const line = (await buyer.post(`/api/v1/procurement/quotations/${quotation.id}/lines`).send({
      prLineId: prLine.id, quantity: 12, uom: 'nr', unitPrice: 430,
      offeredManufacturer: 'Hikvision', offeredModel: 'DS-2CD2143G2-I', complianceResponse: 'comply',
      ...offered,
    }).expect(201)).body;
    return { lineId: line.id as string, quotationId: quotation.id as string, run };
  }

  it('an offer nobody has evaluated is UNKNOWN — not eligible, however low the price', async () => {
    const s = await scene();
    const seen = (await buyer.get(`/api/v1/procurement/quotation-lines/${s.lineId}/eligibility`).expect(200)).body;
    expect(seen).toMatchObject({ eligibility: 'unknown', verdict: null, decidedBy: null });
  });

  it('puts the REQUIREMENT in front of the decider, with the deviation derived', async () => {
    // The supplier offers 10 against a request for 12. A differing quantity is a DEVIATION.
    const s = await scene({ quantity: 10 });
    const view = (await techManager.get(`/api/v1/procurement/quotation-lines/${s.lineId}/evaluation`).expect(200)).body;

    expect(view.requirement).toMatchObject({ quantity: 12, manufacturer: 'Hikvision', model: 'DS-2CD2143G2-I' });
    expect(view.line.quantity).toBe(10);
    expect(view.quantityDeviation).toMatchObject({ deviates: true, requested: 12, offered: 10, difference: -2 });
    // Surfaced, not decided: the offer is still simply un-evaluated.
    expect(view.eligibility).toBe('unknown');
  });

  it('records the verdict with its rationale, and the Buyer can then see eligibility', async () => {
    const s = await scene();
    const verdict = (await techManager.post(`/api/v1/procurement/quotation-lines/${s.lineId}/evaluation`)
      .send({ verdict: 'compliant', rationale: 'meets the specified lens and IP rating' }).expect(201)).body;
    expect(verdict.decidedBy).toBe('tec-manager');
    expect(verdict.rationale).toMatch(/lens and IP rating/);

    const seen = (await buyer.get(`/api/v1/procurement/quotation-lines/${s.lineId}/eligibility`).expect(200)).body;
    expect(seen).toMatchObject({ eligibility: 'eligible', verdict: 'compliant', decidedBy: 'tec-manager' });
  });

  it('refuses a verdict with no rationale', async () => {
    const s = await scene();
    const res = await techManager.post(`/api/v1/procurement/quotation-lines/${s.lineId}/evaluation`)
      .send({ verdict: 'non_compliant', rationale: '   ' });
    expect(res.status).toBe(400);
    expect(String(res.body?.message)).toMatch(/requires a rationale/i);
  });

  it('REFUSES THE BUYER the decision, while still letting them read eligibility', async () => {
    const s = await scene();
    const denied = await buyer.post(`/api/v1/procurement/quotation-lines/${s.lineId}/evaluation`)
      .send({ verdict: 'compliant', rationale: 'looks fine to me' });
    expect(denied.status).toBe(403);
    expect(String(denied.body?.message)).toMatch(/engineering\.technical-evaluation\.decide/i);

    // And the Buyer cannot see the evaluator's working either — that surface is engineering's.
    await buyer.get(`/api/v1/procurement/quotation-lines/${s.lineId}/evaluation`).expect(403);
    await buyer.get(`/api/v1/procurement/quotation-lines/${s.lineId}/eligibility`).expect(200);
  });

  it('does NOT let the supplier’s own claim stand in for a verdict', async () => {
    // The supplier said `comply` when the line was recorded. Nobody internal has decided.
    const s = await scene({ complianceResponse: 'comply' });
    const view = (await techManager.get(`/api/v1/procurement/quotation-lines/${s.lineId}/evaluation`).expect(200)).body;
    expect(view.line.complianceResponse).toBe('comply');
    expect(view.eligibility).toBe('unknown');
    expect(view.current).toBeNull();
  });

  it('amends a verdict by supersession, keeping the replaced decision and its reasoning', async () => {
    const s = await scene();
    await techManager.post(`/api/v1/procurement/quotation-lines/${s.lineId}/evaluation`)
      .send({ verdict: 'non_compliant', rationale: 'lens does not meet the specified focal length' }).expect(201);

    const amended = await techManager.post(`/api/v1/procurement/quotation-lines/${s.lineId}/evaluation`)
      .send({ verdict: 'compliant_with_deviation', rationale: 'supplier confirmed the correct lens variant', amendmentReason: 'datasheet clarified after the first review' });
    expect(amended.status).toBe(201);

    const view = (await techManager.get(`/api/v1/procurement/quotation-lines/${s.lineId}/evaluation`).expect(200)).body;
    expect(view.eligibility).toBe('eligible');
    expect(view.current.verdict).toBe('compliant_with_deviation');
    // The replaced decision survives with its own reasoning — the audit trail is the point.
    expect(view.history.length).toBe(2);
    const replaced = view.history.find((h: { supersededAt: string | null }) => h.supersededAt !== null);
    expect(replaced.verdict).toBe('non_compliant');
    expect(replaced.rationale).toMatch(/focal length/);
  });

  it('refuses an amendment that does not say why it replaced the previous decision', async () => {
    const s = await scene();
    await techManager.post(`/api/v1/procurement/quotation-lines/${s.lineId}/evaluation`)
      .send({ verdict: 'compliant', rationale: 'meets spec' }).expect(201);
    const res = await techManager.post(`/api/v1/procurement/quotation-lines/${s.lineId}/evaluation`)
      .send({ verdict: 'non_compliant', rationale: 'on reflection it does not' });
    expect(res.status).toBe(400);
    expect(String(res.body?.message)).toMatch(/requires a reason/i);
  });

  it('refuses to evaluate a line the supplier declined — nothing was offered', async () => {
    const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const project = (await admin.post('/api/v1/projects/projects').send({ title: `Decl ${run}` }).expect(201)).body;
    const mat = (await buyer.post('/api/v1/inventory/materials')
      .send({ code: `M-${run}`, name: 'cable', uom: 'm' }).expect(201)).body;
    const pr = (await buyer.post('/api/v1/procurement/purchase-requests')
      .send({ title: `PR ${run}`, projectId: project.id, value: 0 }).expect(201)).body;
    const prLine = (await buyer.post(`/api/v1/procurement/purchase-requests/${pr.id}/lines`)
      .send({ material: mat.id, quantity: 100, estimatedUnitCost: 4 }).expect(201)).body;
    const rfq = (await buyer.post('/api/v1/procurement/rfqs').send({ title: `R ${run}`, prId: pr.id }).expect(201)).body;
    const quotation = (await buyer.post(`/api/v1/procurement/rfqs/${rfq.id}/quotes`)
      .send({ supplierName: `S ${run}`, amount: 100, currency: 'AED' }).expect(201)).body;
    const declined = (await buyer.post(`/api/v1/procurement/quotations/${quotation.id}/lines`)
      .send({ prLineId: prLine.id, response: 'no_bid' }).expect(201)).body;

    const res = await techManager.post(`/api/v1/procurement/quotation-lines/${declined.id}/evaluation`)
      .send({ verdict: 'compliant', rationale: 'n/a' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(String(res.body?.message)).toMatch(/did not offer anything/i);
  });

  it('refuses a lead time on the quotation header — it belongs on the line', async () => {
    const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const rfq = (await buyer.post('/api/v1/procurement/rfqs').send({ title: `LT ${run}` }).expect(201)).body;
    const res = await buyer.post(`/api/v1/procurement/rfqs/${rfq.id}/quotes`)
      .send({ supplierName: `S ${run}`, amount: 100, currency: 'AED', leadTimeDays: 21 });
    expect(res.status).toBe(400);
    expect(String(res.body?.message)).toMatch(/must be recorded on the quotation line/i);
  });

  it('refuses an unauthenticated caller', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/procurement/quotation-lines/00000000-0000-0000-0000-000000000000/eligibility')
      .expect(401);
  });
});
