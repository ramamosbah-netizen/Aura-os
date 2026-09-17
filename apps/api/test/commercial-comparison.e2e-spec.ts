// SUP-06 — commercial normalisation over HTTP.
//
// Two suppliers answer the same requirement on different terms: different currencies, different tax
// treatments, different quantities. The comparison states what is comparable and refuses what is
// not, and it names neither a winner nor a cheapest.
//
// WHAT THIS PROVES: the HTTP contract, the permission, and that the refusals survive serialisation.
// WHAT IT DOES NOT PROVE: persistence — in-memory stores, by construction.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, ExchangeRateService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `sup06-${Date.now()}`;

describe('comparing offers against one requirement (HTTP, Auth-ON)', () => {
  let app: INestApplication;
  let buyer: ReturnType<typeof request.agent>;
  /** A Site Engineer: holds no procurement permission at all in the shipped catalogue. */
  let siteEngineer: ReturnType<typeof request.agent>;
  /** Sets up the project and the catalogue material — neither of which is the Buyer's to create. */
  let seeder: ReturnType<typeof request.agent>;
  let prLineId: string;
  let rfqId: string;
  /** Post as the Buyer — the capture routes are theirs since QC-01. */
  let capture: <T>(path: string, data: unknown) => Promise<T>;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'sup06-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());

    const auth = app.get(AuthService);
    const access = app.get(AccessService);
    const users = app.get(UsersService);
    /**
     * Real shipped roles, unmodified. The Buyer owns the RFQ context. The refused actor is a SITE
     * ENGINEER, not a Storekeeper: a Storekeeper holds read-only procurement in the shipped
     * catalogue and can legitimately read this, which an earlier version of this spec asserted
     * otherwise and was simply wrong about.
     */
    access.grant({ userId: 'sup06-buyer', roleId: 'r-procurement', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'sup06-site', roleId: 'r-site-engineer', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'sup06-seed', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 1_000_000 });
    for (const userId of ['sup06-buyer', 'sup06-site', 'sup06-seed']) users.save({ tenantId: TENANT, userId, displayName: userId, active: true });

    const tenant = app.get(TenantContext);
    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    const server = app.getHttpServer();
    buyer = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'sup06-buyer', tenantId: TENANT })}`);
    siteEngineer = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'sup06-site', tenantId: TENANT })}`);
    seeder = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'sup06-seed', tenantId: TENANT })}`);

    // EUR is governed from 1 September. GBP is deliberately never registered.
    await app.get(ExchangeRateService).setRate(TENANT, 'EUR', 'AED', 4.0, new Date('2026-09-01'));

    const as = (agent: ReturnType<typeof request.agent>) => async <T>(path: string, data: unknown): Promise<T> => {
      const res = await agent.post(path).send(data);
      expect(res.ok, `${path} — ${res.status} ${JSON.stringify(res.body)}`).toBe(true);
      return res.body as T;
    };
    /**
     * The Buyer READS the comparison — that is the SUP-06 surface under test.
     *
     * The project and the catalogue material are seeded by an administrator because a Buyer holds
     * those read-only, correctly. The QUOTATIONS are not: QC-01 gave the capture routes
     * permissions a Buyer actually holds, so `seed` and `post` are the same actor for them.
     */
    const post = as(buyer);
    const seed = as(buyer);
    const seedAsAdmin = as(seeder);
    capture = seed;

    // A requirement for 12 cameras…
    const project = await seedAsAdmin<{ id: string }>('/api/v1/projects/projects', { title: `SUP-06 ${Date.now()}` });
    const material = await seedAsAdmin<{ id: string }>('/api/v1/inventory/materials', {
      code: `CAM-${Date.now()}`, name: '4MP dome camera', uom: 'nr',
    });
    const pr = await post<{ id: string }>('/api/v1/procurement/purchase-requests', {
      title: 'Cameras', projectId: project.id, value: 0,
    });
    const prLine = await post<{ id: string }>(`/api/v1/procurement/purchase-requests/${pr.id}/lines`, {
      material: material.id, quantity: 12, estimatedUnitCost: 450,
    });
    prLineId = prLine.id;
    const rfq = await post<{ id: string }>('/api/v1/procurement/rfqs', { title: 'RFQ', prId: pr.id });
    rfqId = rfq.id;

    /**
     * …and three offers on deliberately different terms, captured through the QC-01 surface.
     *
     * The comparison reads the commercially effective REVISION of each supplier's offer, so the
     * fixture opens a quotation family, records a revision carrying the commercial terms, confirms
     * it, and prices the requirement inside it. Building these as legacy quotations would exercise a
     * path the comparison no longer reads — which is exactly what this stage changed.
     */
    const quote = async (
      supplierName: string,
      terms: Record<string, unknown>,
      lineFacts: Record<string, unknown>,
    ) => {
      const { baseOffer } = await seed<{ baseOffer: { id: string } }>(
        '/api/v1/procurement/quotations/families', { rfqId: rfq.id, supplierName },
      );
      const revision = await seed<{ id: string }>(
        `/api/v1/procurement/quotations/offers/${baseOffer.id}/revisions`, terms,
      );
      await seed(`/api/v1/procurement/quotations/revisions/${revision.id}/lines`, { prLineId, ...lineFacts });
      // Received, then confirmed: only a confirmed revision is the commercially effective offer.
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${revision.id}/status`).send({ status: 'received' }).expect(200);
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${revision.id}/status`).send({ status: 'confirmed' }).expect(200);
      return revision.id;
    };

    await quote(
      'Alpha (AED, tax-exclusive, exact quantity)',
      { currency: 'AED', taxTreatment: 'exclusive', taxRatePct: 5, validityDate: '2026-12-31' },
      { quantity: 12, uom: 'nr', unitPrice: 500 },
    );

    await quote(
      'Beta (EUR, tax-inclusive, short quantity)',
      { currency: 'EUR', taxTreatment: 'inclusive', taxRatePct: 5, freightAmount: 200, freightTerms: 'DAP Dubai', validityDate: '2026-12-31' },
      { quantity: 10, uom: 'nr', unitPrice: 126 },
    );

    await quote(
      'Gamma (GBP, no governed rate)',
      // Valid until 31 July: LIVE on a June comparison date, EXPIRED on a September one. Validity is
      // judged against the comparison date, and this offer exists to prove that.
      { currency: 'GBP', taxTreatment: 'exclusive', taxRatePct: 0, validityDate: '2026-07-31' },
      { quantity: 12, uom: 'nr', unitPrice: 90 },
    );
  });

  afterAll(async () => { await app?.close(); });

  const compare = (query: Record<string, string> = {}) =>
    buyer.get(`/api/v1/procurement/quotations/by-requirement/${prLineId}/comparison`)
      .query({ comparisonDate: '2026-09-17', ...query });

  const offerOf = (body: { offers: Array<{ supplierName: string }> }, prefix: string) =>
    body.offers.find((o) => o.supplierName.startsWith(prefix))!;

  it('states an exact, tax-exclusive, base-currency offer completely', async () => {
    const res = await compare().expect(200);
    const alpha = offerOf(res.body, 'Alpha');

    expect(alpha.quantityCompliance).toBe('exact');
    expect(alpha.normalisedUnitPrice).toMatchObject({
      status: 'comparable', unitValue: 500, currency: 'AED',
      comparisonDate: '2026-09-17', taxBasis: 'ex-tax', freightBasis: 'excluded',
    });
    // Offered exactly what was asked for, so the line total IS known.
    expect(alpha.normalisedRequestedLineTotal).toMatchObject({ status: 'comparable', unitValue: 6000 });
  });

  it('puts a foreign tax-inclusive offer on the same basis, and refuses to invent its line total', async () => {
    const res = await compare().expect(200);
    const beta = offerOf(res.body, 'Beta');

    // 126 EUR inclusive of 5% is 120 ex-tax; at the governed 4.0 that is AED 480.
    expect(beta.normalisedUnitPrice).toMatchObject({
      status: 'comparable', unitValue: 480, currency: 'AED',
      fx: { rate: 4, effectiveDate: '2026-09-01' },
    });

    // Cheaper per unit than Alpha — and the requisition-line cost is still NOT known, because Beta
    // offered 10 against 12 and 12 × 480 is an offer Beta never made.
    expect(beta).toMatchObject({ requestedQuantity: 12, quotedQuantity: 10, quantityDeviation: -2, quantityCompliance: 'deviated' });
    expect(beta.coverageRatio).toBeCloseTo(0.8333, 4);
    expect(beta.normalisedRequestedLineTotal).toMatchObject({
      status: 'unknown', reason: 'quoted_quantity_differs',
    });
  });

  it('refuses an offer it has no governed rate for, naming the pair and the date', async () => {
    const res = await compare().expect(200);
    const gamma = offerOf(res.body, 'Gamma');

    expect(gamma.normalisedUnitPrice).toMatchObject({ status: 'unknown', reason: 'no_governed_rate' });
    expect(gamma.normalisedUnitPrice.missingInputs[0]).toContain('GBP->AED');
    expect(gamma.normalisedUnitPrice.missingInputs[0]).toContain('2026-09-17');
  });

  it('keeps expiry separate from value — Gamma is expired AND unpriced, Beta is live AND short', async () => {
    const res = await compare().expect(200);
    expect(offerOf(res.body, 'Gamma').commercialStatus).toBe('expired');
    expect(offerOf(res.body, 'Beta').commercialStatus).toBe('live');
    // Beta's price is known even though its quantity deviates: three separate facts, three fields.
    const beta = offerOf(res.body, 'Beta');
    expect(beta.normalisedUnitPrice.status).toBe('comparable');
    expect(beta.normalisedRequestedLineTotal.status).toBe('unknown');
    expect(beta.quantityCompliance).toBe('deviated');
  });

  it('keeps freight at the quotation level and never inside a line value', async () => {
    const res = await compare().expect(200);
    const beta = res.body.quotations.find((q: { supplierName: string }) => q.supplierName.startsWith('Beta'));
    // 200 EUR inclusive of 5% is 190.48 ex-tax, at 4.0 → AED 761.9.
    expect(beta.freight).toMatchObject({ status: 'comparable', currency: 'AED' });
    expect(beta.freight.unitValue).toBeCloseTo(761.9, 1);
    expect(beta.freightTerms).toBe('DAP Dubai');
    // Nothing in the payload claims a landed or all-in figure.
    expect(JSON.stringify(res.body)).not.toMatch(/landed|all-?in total/i);
  });

  it('names no winner: no cheapest, no recommendation, no ordering by price', async () => {
    const res = await compare().expect(200);
    const body = JSON.stringify(res.body);
    for (const word of ['cheapest', 'lowest', 'recommend', 'winner', 'best', 'rank']) {
      expect(body.toLowerCase(), `a comparison must not contain "${word}" — SUP-13 decides`).not.toContain(word);
    }
    // The offers come back in the order they were recorded, not sorted by price.
    expect(res.body.offers[0].supplierName).toMatch(/^Alpha/);
  });

  it('carries the comparison date on every value, and answers a different date differently', async () => {
    // Before the EUR rate took effect, Beta cannot be valued at all…
    const june = await compare({ comparisonDate: '2026-06-30' }).expect(200);
    expect(june.body.context.comparisonDate).toBe('2026-06-30');
    expect(offerOf(june.body, 'Beta').normalisedUnitPrice).toMatchObject({ status: 'unknown', reason: 'no_governed_rate' });
    // …and Gamma was still live back then, though its price was never knowable.
    expect(offerOf(june.body, 'Gamma').commercialStatus).toBe('live');

    // Alpha is in the base currency, so it is comparable on both dates — and says which.
    expect(offerOf(june.body, 'Alpha').normalisedUnitPrice).toMatchObject({ comparisonDate: '2026-06-30' });
  });

  /**
   * The failure nobody notices: a supplier quietly missing from a comparison. A buyer sees three
   * rows where there were four and has no reason to ask why.
   */
  describe('a supplier with no commercially effective revision still appears', () => {
    it('shows a WITHDRAWN current offer as unknown, and never reinstates the revision before it', async () => {
      const { baseOffer } = await capture<{ baseOffer: { id: string } }>(
        '/api/v1/procurement/quotations/families', { rfqId, supplierName: 'Delta (withdrawn)' });

      // Two revisions, the second confirmed and then pulled by the supplier.
      const first = await capture<{ id: string }>(`/api/v1/procurement/quotations/offers/${baseOffer.id}/revisions`,
        { currency: 'AED', taxTreatment: 'exclusive' });
      await capture(`/api/v1/procurement/quotations/revisions/${first.id}/lines`, { prLineId, quantity: 12, uom: 'nr', unitPrice: 400 });
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${first.id}/status`).send({ status: 'received' }).expect(200);
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${first.id}/status`).send({ status: 'confirmed' }).expect(200);

      const second = await capture<{ id: string }>(`/api/v1/procurement/quotations/offers/${baseOffer.id}/revisions`,
        { currency: 'AED', taxTreatment: 'exclusive' });
      await capture(`/api/v1/procurement/quotations/revisions/${second.id}/lines`, { prLineId, quantity: 12, uom: 'nr', unitPrice: 380 });
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${second.id}/status`).send({ status: 'received' }).expect(200);
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${second.id}/status`).send({ status: 'confirmed' }).expect(200);
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${second.id}/status`).send({ status: 'withdrawn' }).expect(200);

      const res = await compare().expect(200);
      const delta = offerOf(res.body, 'Delta');

      // PRESENT, with the reason — not filtered out, and not quietly priced at Rev 0's 400.
      expect(delta, 'a supplier whose offer was withdrawn must still appear').toBeTruthy();
      expect(delta.notComparableReason).toMatch(/withdrawn by the supplier and no earlier revision is reinstated/);
      expect(delta.normalisedUnitPrice.status).toBe('unknown');
      expect(JSON.stringify(delta)).not.toContain('400');
    });

    it('shows a quotation captured but never confirmed as unknown, with the reason', async () => {
      const { baseOffer } = await capture<{ baseOffer: { id: string } }>(
        '/api/v1/procurement/quotations/families', { rfqId, supplierName: 'Epsilon (unconfirmed)' });
      const draft = await capture<{ id: string }>(`/api/v1/procurement/quotations/offers/${baseOffer.id}/revisions`,
        { currency: 'AED', taxTreatment: 'exclusive' });
      await capture(`/api/v1/procurement/quotations/revisions/${draft.id}/lines`, { prLineId, quantity: 12, uom: 'nr', unitPrice: 300 });
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${draft.id}/status`).send({ status: 'received' }).expect(200);

      const res = await compare().expect(200);
      const epsilon = offerOf(res.body, 'Epsilon');
      expect(epsilon).toBeTruthy();
      expect(epsilon.notComparableReason).toMatch(/received but not confirmed/);
      expect(epsilon.normalisedUnitPrice.status).toBe('unknown');
    });
  });

  it('carries the revision provenance, so a sheet can name the offer a figure came from', async () => {
    const res = await compare().expect(200);
    const alpha = offerOf(res.body, 'Alpha');
    expect(alpha.provenance).toMatchObject({ offerKind: 'base', revisionNo: 0 });
    expect(alpha.provenance.revisionId).toBeTruthy();
  });

  it('refuses a malformed date or an ungovernable base currency rather than guessing', async () => {
    await compare({ comparisonDate: 'whenever' }).expect(400);
    await compare({ baseCurrency: 'JPY' }).expect(400);
  });

  it('is governed by procurement.rfq.read — a Site Engineer is refused it', async () => {
    await siteEngineer.get(`/api/v1/procurement/quotations/by-requirement/${prLineId}/comparison`).expect(403);
    // …while the Buyer reaches it, so this is a permission boundary and not a broken token.
    await compare().expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/procurement/quotations/by-requirement/${prLineId}/comparison`).expect(401);
  });
});
