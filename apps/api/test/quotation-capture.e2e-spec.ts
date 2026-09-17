// QC-01 stage A — a Buyer capturing a supplier quotation, over HTTP, Auth-ON.
//
// The case the model was frozen around, end to end: Rev 0 at AED 100, Rev 1 at AED 92, Rev 2 at
// AED 95 with free freight. Under the old single mutable row, Rev 0 and Rev 1 ceased to exist.
//
// WHAT THIS PROVES: the HTTP contract, the lifecycle, and that a BUYER can do it — the existing
// quote route derives `procurement.rfq.quotes`, which no shipped role holds.
// WHAT IT DOES NOT PROVE: persistence, or the partial unique index. In-memory stores, by
// construction; the index is PostgreSQL's and is proved separately.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `qc01-${Date.now()}`;
const RFQ = '11111111-2222-3333-4444-555555555555';

describe('capturing a supplier quotation (HTTP, Auth-ON)', () => {
  let app: INestApplication;
  let buyer: ReturnType<typeof request.agent>;
  let siteEngineer: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'qc01-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());

    const auth = app.get(AuthService);
    const access = app.get(AccessService);
    const users = app.get(UsersService);
    // Real shipped roles, unmodified. The whole point is that r-procurement is enough.
    access.grant({ userId: 'qc01-buyer', roleId: 'r-procurement', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'qc01-site', roleId: 'r-site-engineer', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    for (const userId of ['qc01-buyer', 'qc01-site']) users.save({ tenantId: TENANT, userId, displayName: userId, active: true });

    const tenant = app.get(TenantContext);
    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    const server = app.getHttpServer();
    buyer = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'qc01-buyer', tenantId: TENANT })}`);
    siteEngineer = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'qc01-site', tenantId: TENANT })}`);
  });

  afterAll(async () => { await app?.close(); });

  const open = (supplierName: string, ref?: string) =>
    buyer.post('/api/v1/procurement/quotations/families').send({ rfqId: RFQ, supplierName, supplierQuotationRef: ref });
  const startRevision = (offerId: string, facts: Record<string, unknown>) =>
    buyer.post(`/api/v1/procurement/quotations/offers/${offerId}/revisions`).send(facts);
  const setStatus = (revisionId: string, status: string) =>
    buyer.patch(`/api/v1/procurement/quotations/revisions/${revisionId}/status`).send({ status });

  it('THE BUYER CAN DO IT — the permission a buyer actually holds', async () => {
    const res = await open('Gulf ELV', 'Q-1001').expect(201);
    expect(res.body.family).toMatchObject({ supplierName: 'Gulf ELV', supplierQuotationRef: 'Q-1001' });
    // …and a family arrives with its base offer, because a quotation with no offer is half a record.
    expect(res.body.baseOffer).toMatchObject({ kind: 'base', label: null });
    expect(res.body.reused).toBe(false);
  });

  it('re-quoting reuses the supplier’s family — one supplier, one position in a comparison', async () => {
    const first = await open('Repeat Trading').expect(201);
    const again = await open('Repeat Trading').expect(201);
    expect(again.body.reused).toBe(true);
    expect(again.body.family.id).toBe(first.body.family.id);
  });

  it('keeps the whole Rev 0 / Rev 1 / Rev 2 history, and marks only Rev 2 effective', async () => {
    const { body: opened } = await open('History Co', 'Q-2001').expect(201);
    const offerId = opened.baseOffer.id;
    const facts = { currency: 'AED', taxTreatment: 'exclusive', taxRatePct: 5, validityDate: '2026-12-31' };

    const revs: string[] = [];
    for (const freight of [500, 500, 0]) {
      const { body } = await startRevision(offerId, { ...facts, freightAmount: freight }).expect(201);
      await setStatus(body.id, 'received').expect(200);
      await setStatus(body.id, 'confirmed').expect(200);
      revs.push(body.id);
    }

    const { body: read } = await buyer.get(`/api/v1/procurement/quotations/families/${opened.family.id}`).expect(200);
    const base = read.offers.find((o: { offer: { kind: string } }) => o.offer.kind === 'base');

    // Three revisions survive. Nothing was overwritten.
    expect(base.history).toHaveLength(3);
    expect(base.history.map((h: { revision: { revisionNo: number } }) => h.revision.revisionNo)).toEqual([2, 1, 0]);
    // Exactly one is effective, and it is the last.
    expect(base.effective).toMatchObject({ revisionNo: 2, status: 'confirmed', supersedesRevisionId: revs[1] });
    expect(base.history.filter((h: { revision: { status: string } }) => h.revision.status === 'superseded')).toHaveLength(2);
    expect(base.noEffectiveReason).toBeNull();

    // And the commercial restructure is readable: freight moved from 500 to nothing.
    const latest = base.history[0];
    expect(latest.changesFromPrevious).toContainEqual({ field: 'freight amount', from: 500, to: 0 });
  });

  it('refuses to edit a received revision, and says to record a new one instead', async () => {
    const { body: opened } = await open('Immutable Ltd').expect(201);
    const { body: draft } = await startRevision(opened.baseOffer.id, { currency: 'AED', taxTreatment: 'exclusive' }).expect(201);

    // A draft may still be corrected.
    await buyer.patch(`/api/v1/procurement/quotations/revisions/${draft.id}`).send({ paymentTerms: '30 days' }).expect(200);

    await setStatus(draft.id, 'received').expect(200);
    const refused = await buyer.patch(`/api/v1/procurement/quotations/revisions/${draft.id}`).send({ paymentTerms: '60 days' });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toMatch(/cannot be changed .* new revision/);
  });

  it('a withdrawn effective revision leaves NO effective revision — and never reinstates an earlier one', async () => {
    const { body: opened } = await open('Withdrawn Co').expect(201);
    const offerId = opened.baseOffer.id;
    const facts = { currency: 'AED', taxTreatment: 'exclusive' };

    const { body: rev0 } = await startRevision(offerId, facts).expect(201);
    await setStatus(rev0.id, 'received').expect(200);
    await setStatus(rev0.id, 'confirmed').expect(200);

    const { body: rev1 } = await startRevision(offerId, facts).expect(201);
    await setStatus(rev1.id, 'received').expect(200);
    await setStatus(rev1.id, 'confirmed').expect(200);

    await setStatus(rev1.id, 'withdrawn').expect(200);

    const { body: read } = await buyer.get(`/api/v1/procurement/quotations/families/${opened.family.id}`).expect(200);
    const base = read.offers.find((o: { offer: { kind: string } }) => o.offer.kind === 'base');
    expect(base.effective).toBeNull();
    expect(base.noEffectiveReason).toMatch(/withdrawn by the supplier and no earlier revision is reinstated/);
    // Rev 0 is still superseded — the supplier did not re-offer it by pulling Rev 1.
    expect(base.history.find((h: { revision: { revisionNo: number } }) => h.revision.revisionNo === 0).revision.status).toBe('superseded');
  });

  it('an ALTERNATIVE is a separate offer, and must say what it is offering instead', async () => {
    const { body: opened } = await open('Alternatives Co').expect(201);
    const refused = await buyer.post(`/api/v1/procurement/quotations/families/${opened.family.id}/offers`).send({ label: '  ' });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toMatch(/what is being offered instead/);

    await buyer.post(`/api/v1/procurement/quotations/families/${opened.family.id}/offers`)
      .send({ label: 'Bosch equivalent' }).expect(201);

    const { body: read } = await buyer.get(`/api/v1/procurement/quotations/families/${opened.family.id}`).expect(200);
    expect(read.offers).toHaveLength(2);
    // Base first, then the alternative — and the alternative has NOT replaced the base offer.
    expect(read.offers[0].offer.kind).toBe('base');
    expect(read.offers[1].offer).toMatchObject({ kind: 'alternative', label: 'Bosch equivalent' });
  });

  describe('refuses at capture what a comparison would otherwise discover weeks later', () => {
    it('a tax-inclusive price with no rate', async () => {
      const { body: opened } = await open('Inclusive Co').expect(201);
      const res = await startRevision(opened.baseOffer.id, { currency: 'AED', taxTreatment: 'inclusive' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/must state its tax rate/);
    });

    it('a currency AURA cannot govern a rate for', async () => {
      const { body: opened } = await open('JPY Co').expect(201);
      const res = await startRevision(opened.baseOffer.id, { currency: 'JPY' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('JPY');
    });

    it('a lead time on the header, naming where it belongs', async () => {
      const { body: opened } = await open('Lead Co').expect(201);
      const res = await startRevision(opened.baseOffer.id, { currency: 'AED', leadTimeDays: 30 });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/on the quotation line it applies to/);
    });
  });

  it('is governed by procurement.rfq.* — a Site Engineer is refused, and so is an anonymous caller', async () => {
    await siteEngineer.post('/api/v1/procurement/quotations/families')
      .send({ rfqId: RFQ, supplierName: 'Not mine' }).expect(403);
    await siteEngineer.get('/api/v1/procurement/quotations/families').query({ rfqId: RFQ }).expect(403);
    await request(app.getHttpServer()).post('/api/v1/procurement/quotations/families')
      .send({ rfqId: RFQ, supplierName: 'Anonymous' }).expect(401);
  });
});
