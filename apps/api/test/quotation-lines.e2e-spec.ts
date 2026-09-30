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
 * Wave 4 — the supplier-decision spine, Auth-ON, JWT on.
 *
 * A quotation was a header with one scalar `amount`, so the twelve comparison leaves SUP-01…SUP-12
 * were not unbuilt but STRUCTURALLY IMPOSSIBLE. This proves the facts now exist, item by item, and —
 * just as importantly — that the line records only what the SUPPLIER SAYS.
 *
 * THE BOUNDARY UNDER TEST:
 *
 *   A quotation line is a DECLARATION, never a DETERMINATION. No compliance verdict, no eligibility,
 *   no rank, no comparable value. A supplier writing "comply" is a claim with exactly the standing of
 *   their price, and nothing in this surface converts it into a pass.
 *
 * CAPTURED THE WAY QC-01 NOW REQUIRES (migration 0352). A supplier line belongs to an immutable
 * quotation REVISION, so this suite opens the supplier's quotation (family), takes its base offer and
 * starts a revision — `POST procurement/quotations/:id/lines` now takes that REVISION id. The old
 * fixture posted lines against the RFQ-quote header id, which is why every test here answered 404.
 * An ALTERNATE is no longer a flag on a line: it is a separate, labelled OFFER (migration 0351), so
 * "an alternate must say what it is" is asserted on the offer, where the rule now lives.
 */

const TENANT = `quo-${Date.now()}`;

describe('what a supplier offered, item by item (JWT ON)', () => {
  let app: INestApplication;
  let buyer: ReturnType<typeof request.agent>;
  let reader: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'quotation-lines-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    access.registerRole({
      id: 'r-e2e-quo-buyer', name: 'Buyer (e2e)',
      permissions: ['procurement.*', 'inventory.*', 'projects.project.read', 'projects.*.read'],
    });
    // Reads quotations, cannot record an offer against one.
    access.registerRole({
      id: 'r-e2e-quo-reader', name: 'RFQ reader (e2e)', permissions: ['procurement.rfq.read'],
    });
    for (const [userId, roleId] of [['quo-buyer', 'r-e2e-quo-buyer'], ['quo-reader', 'r-e2e-quo-reader']]) {
      access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: TENANT } });
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }
    access.grant({ userId: 'quo-admin', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 10_000_000 });
    users.save({ tenantId: TENANT, userId: 'quo-admin', displayName: 'quo-admin', active: true });

    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    expect(auth.enabled).toBe(true);

    const server = app.getHttpServer();
    const agent = (sub: string) => request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub, tenantId: TENANT })}`);
    buyer = agent('quo-buyer');
    reader = agent('quo-reader');
    admin = agent('quo-admin');
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  /** A requisition with two material lines, an RFQ, and one supplier's quotation against it. */
  async function scene() {
    const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const project = (await admin.post('/api/v1/projects/projects').send({ title: `Sourcing ${run}` }).expect(201)).body;

    const camera = (await buyer.post('/api/v1/inventory/materials').send({
      code: `CAM-${run}`, name: '4MP dome camera', uom: 'nr',
      specification: 'IP67, 2.8mm fixed lens', manufacturer: 'Hikvision', model: 'DS-2CD2143G2-I',
    }).expect(201)).body;
    const cable = (await buyer.post('/api/v1/inventory/materials').send({
      code: `CBL-${run}`, name: 'Cat6 U/UTP cable', uom: 'm',
    }).expect(201)).body;

    const pr = (await buyer.post('/api/v1/procurement/purchase-requests')
      .send({ title: `Containment ${run}`, projectId: project.id, value: 0 }).expect(201)).body;
    const lineA = (await buyer.post(`/api/v1/procurement/purchase-requests/${pr.id}/lines`)
      .send({ material: camera.id, quantity: 12, estimatedUnitCost: 450 }).expect(201)).body;
    const lineB = (await buyer.post(`/api/v1/procurement/purchase-requests/${pr.id}/lines`)
      .send({ material: cable.id, quantity: 250, estimatedUnitCost: 4 }).expect(201)).body;

    const rfq = (await buyer.post('/api/v1/procurement/rfqs')
      .send({ title: `RFQ ${run}`, prId: pr.id }).expect(201)).body;
    const supplier = await quotationFrom(rfq.id as string, `Gulf ELV ${run}`, 'USD');

    return {
      prId: pr.id as string, lineA: lineA.id as string, lineB: lineB.id as string, rfqId: rfq.id as string,
      familyId: supplier.familyId, quotationId: supplier.revisionId, run,
    };
  }

  /**
   * One supplier's quotation against an RFQ, captured as QC-01 has it: the family, its BASE offer, and
   * a draft Rev 1 carrying the supplier's commercial terms. Returns the REVISION the lines go on.
   */
  async function quotationFrom(rfqId: string, supplierName: string, currency: string) {
    const family = (await buyer.post('/api/v1/procurement/quotations/families')
      .send({ rfqId, supplierName, supplierQuotationRef: `${supplierName}-Q1` }).expect(201)).body as { family: { id: string }; baseOffer: { id: string } };
    const revision = (await buyer.post(`/api/v1/procurement/quotations/offers/${family.baseOffer.id}/revisions`).send({
      supplierRevisionRef: 'Rev 1', currency, taxTreatment: 'exclusive', taxRatePct: 5,
      freightAmount: 300, freightTerms: 'CIF Jebel Ali', paymentTerms: '30 days net', validityDate: '2026-12-31',
    }).expect(201)).body as { id: string };
    return { familyId: family.family.id, revisionId: revision.id };
  }

  const addLine = (quotationId: string, body: Record<string, unknown>) =>
    buyer.post(`/api/v1/procurement/quotations/${quotationId}/lines`).send(body);

  it('records an offer against a requisition line, with the supplier’s own terms preserved', async () => {
    const s = await scene();
    const line = (await addLine(s.quotationId, {
      prLineId: s.lineA, quantity: 12, uom: 'nr', unitPrice: 430,
      offeredManufacturer: 'Hikvision', offeredModel: 'DS-2CD2143G2-I',
      complianceResponse: 'comply', leadTimeDays: 21, warrantyMonths: 24,
    }).expect(201)).body;

    expect(line.prLineId).toBe(s.lineA);
    expect(line.unitPrice).toBe(430);
    expect(line.warrantyMonths).toBe(24);

    // THE BOUNDARY: the supplier's claim is recorded, and no verdict exists anywhere on the record.
    expect(line.complianceResponse).toBe('comply');
    for (const forbidden of ['isCompliant', 'eligible', 'technicallyApproved', 'rank', 'normalisedTotal', 'landedCost']) {
      expect(line, forbidden).not.toHaveProperty(forbidden);
    }
    // And the supplier's identity and terms live on the quotation, not copied onto every line.
    for (const forbidden of ['supplierId', 'rfqId', 'currency']) {
      expect(line, forbidden).not.toHaveProperty(forbidden);
    }
  });

  it('refuses an offer that answers no requisition line, and one that answers a line that does not exist', async () => {
    const s = await scene();
    const noLine = await addLine(s.quotationId, { quantity: 1, unitPrice: 1 });
    expect(noLine.status).toBe(400);
    expect(String(noLine.body?.message)).toMatch(/must answer a requisition line/i);

    const bogus = await addLine(s.quotationId, {
      prLineId: '00000000-0000-0000-0000-000000000000', quantity: 1, unitPrice: 1,
    });
    expect(bogus.status).toBeGreaterThanOrEqual(400);
    expect(bogus.status).toBeLessThan(500);
  });

  it('answers each requirement once — a second price for one requirement is refused', async () => {
    const s = await scene();
    await addLine(s.quotationId, { prLineId: s.lineA, quantity: 12, uom: 'nr', unitPrice: 430 }).expect(201);
    const again = await addLine(s.quotationId, { prLineId: s.lineA, quantity: 12, uom: 'nr', unitPrice: 399 });
    expect(again.status).toBe(409);
    expect(String(again.body?.message)).toMatch(/already answers/i);
  });

  it('keeps a quoted line an actual offer, and points an unpriced one at no_bid', async () => {
    const s = await scene();
    const unpriced = await addLine(s.quotationId, { prLineId: s.lineA, quantity: 12, uom: 'nr' });
    expect(unpriced.status).toBe(400);
    expect(String(unpriced.body?.message)).toMatch(/records no_bid instead/i);
  });

  it('distinguishes a DECLINED requirement from an unanswered one', async () => {
    const s = await scene();
    await addLine(s.quotationId, { prLineId: s.lineA, quantity: 12, uom: 'nr', unitPrice: 430 }).expect(201);
    // The supplier declines the cable outright. That is an answer.
    await addLine(s.quotationId, { prLineId: s.lineB, response: 'no_bid', notes: 'not stocked' }).expect(201);

    const summary = (await buyer.get(`/api/v1/procurement/quotations/${s.quotationId}/summary`)
      .query({ prLines: [s.lineA, s.lineB, 'ghost-requirement'].join(',') }).expect(200)).body;

    expect(summary.coverage).toMatchObject({ requirements: 3, quoted: 1, declined: 1, unanswered: 1 });
    // The supplier's OWN total, in the supplier's OWN currency — derived, and labelled as theirs.
    expect(summary.quotedAmount).toBe(12 * 430);
    expect(summary.currency).toBe('USD');
  });

  it('refuses a priced decline — silence, refusal and an offer stay three different facts', async () => {
    const s = await scene();
    const contradiction = await addLine(s.quotationId, { prLineId: s.lineA, response: 'no_bid', unitPrice: 430 });
    expect(contradiction.status).toBe(400);
    expect(String(contradiction.body?.message)).toMatch(/declined line cannot carry a price/i);
  });

  it('requires an alternate to say what it actually is', async () => {
    const s = await scene();
    // An alternate is its own OFFER beside the base one, and it must say what is offered instead.
    const vague = await buyer.post(`/api/v1/procurement/quotations/families/${s.familyId}/offers`).send({ label: '   ' });
    expect(vague.status).toBe(400);
    expect(String(vague.body?.message)).toMatch(/must say what is being offered instead/i);

    // Named, and still not an equivalent — nothing here grants it compliance.
    const offer = (await buyer.post(`/api/v1/procurement/quotations/families/${s.familyId}/offers`)
      .send({ label: 'Dahua IPC-HDBW3441E instead of the specified dome' }).expect(201)).body as { id: string; kind: string };
    expect(offer.kind).toBe('alternative');
    const rev = (await buyer.post(`/api/v1/procurement/quotations/offers/${offer.id}/revisions`)
      .send({ supplierRevisionRef: 'Alt Rev 1', currency: 'USD' }).expect(201)).body as { id: string };
    const named = (await addLine(rev.id, {
      prLineId: s.lineA, quantity: 12, uom: 'nr', unitPrice: 380,
      offeredManufacturer: 'Dahua', offeredModel: 'IPC-HDBW3441E', complianceResponse: 'comply_with_deviation',
      deviations: 'different lens', exclusions: 'no mounting bracket',
    }).expect(201)).body;
    expect(named.offeredModel).toBe('IPC-HDBW3441E');
    expect(named.deviations).toBe('different lens');
    expect(named).not.toHaveProperty('isCompliant');
    // The base offer's answer to the same requirement is untouched by the alternative's.
    expect(((await buyer.get(`/api/v1/procurement/quotations/${s.quotationId}/lines`).expect(200)).body as unknown[]).length).toBe(0);
  });

  it('reads every supplier’s answer to ONE requirement — the grain a comparison needs', async () => {
    const s = await scene();
    // A SECOND supplier quoting the same RFQ. The old fixture reached for "the first RFQ in the list"
    // and swallowed every failure, so it could pass having compared one supplier with nobody.
    const other = await quotationFrom(s.rfqId, `Second ${s.run}`, 'AED');

    await addLine(s.quotationId, { prLineId: s.lineA, quantity: 12, uom: 'nr', unitPrice: 430 }).expect(201);
    await addLine(other.revisionId, { prLineId: s.lineA, quantity: 12, uom: 'nr', unitPrice: 415 }).expect(201);

    const answers = (await buyer.get(`/api/v1/procurement/quotations/by-requirement/${s.lineA}`).expect(200)).body as Array<{ prLineId: string; unitPrice: number }>;
    expect(answers.map((a) => a.unitPrice).sort((x, y) => x - y)).toEqual([415, 430]);
    expect(answers.every((a) => a.prLineId === s.lineA)).toBe(true);
  });

  it('refuses a reader who may see quotations but not record an offer, and an unauthenticated caller', async () => {
    const s = await scene();
    await reader.get(`/api/v1/procurement/quotations/${s.quotationId}/lines`).expect(200);
    const denied = await reader.post(`/api/v1/procurement/quotations/${s.quotationId}/lines`)
      .send({ prLineId: s.lineA, quantity: 1, unitPrice: 1 });
    expect(denied.status).toBe(403);
    expect(String(denied.body?.message)).toMatch(/procurement\.rfq\.update/i);

    await request(app.getHttpServer())
      .get(`/api/v1/procurement/quotations/${s.quotationId}/lines`).expect(401);
  });
});
