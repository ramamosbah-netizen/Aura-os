// SUP-14 — the award, over HTTP, Auth-ON.
//
// THE QUESTION THIS SPEC EXISTS TO ANSWER: what currency is the purchase order in?
//
// The supplier quotes USD 100 a unit. The buyer compares in AED at a governed rate of 3.6725, and
// decides on AED 3,672.50. The order that goes to that supplier must say USD 100 a unit — because
// the comparison was a way of weighing offers against each other, and the order is a contract with
// somebody who never quoted in AED and never agreed to that rate.
//
// It also pins what the award refuses (an unapproved recommendation, a stale one, a Buyer trying to
// execute one) and that the legacy path — award a quote by its header number, raise an order for
// that one figure with no lines — now refuses and says where the award went.
//
// WHAT THIS PROVES: the HTTP contract, the permission, the currency and terms carried onto the order
// and its lines, and the refusals.
// WHAT IT DOES NOT PROVE: persistence — in-memory stores, by construction. That is the browser
// suite's job, against Postgres.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, ExchangeRateService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `sup14-${Date.now()}`;
const COMPARISON_DATE = '2026-03-10';

describe('the award: an approved recommendation becomes purchase orders (HTTP, Auth-ON)', () => {
  let app: INestApplication;
  let buyer: ReturnType<typeof request.agent>;
  let manager: ReturnType<typeof request.agent>;
  let seeder: ReturnType<typeof request.agent>;
  let rfqId: string;
  let prLineIds: string[] = [];
  const offers: Record<string, { offerId: string; revisionId: string }> = {};

  const post = async <T>(a: ReturnType<typeof request.agent>, path: string, data?: unknown): Promise<T> => {
    const res = await a.post(path).send(data ?? {});
    expect(res.ok, `${path} — ${res.status} ${JSON.stringify(res.body)}`).toBe(true);
    return res.body as T;
  };

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'sup14-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());

    const auth = app.get(AuthService);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    // Real shipped roles, and the approval limit where the ABAC evaluation actually reads it — at
    // the top level of a grant it is silently ignored and every grant becomes unlimited.
    access.grant({ userId: 'sup14-buyer', roleId: 'r-procurement', scope: { kind: 'org', level: 'tenant', id: TENANT }, attributes: { approvalLimit: 1_000_000 } });
    access.grant({ userId: 'sup14-manager', roleId: 'r-procurement-manager', scope: { kind: 'org', level: 'tenant', id: TENANT }, attributes: { approvalLimit: 1_000_000 } });
    access.grant({ userId: 'sup14-seed', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, attributes: { approvalLimit: 10_000_000 } });
    for (const userId of ['sup14-buyer', 'sup14-manager', 'sup14-seed']) {
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }

    const tenant = app.get(TenantContext);
    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    expect(auth.enabled, 'this spec is worthless with auth off — the guard would never run').toBe(true);

    const server = app.getHttpServer();
    const agent = (sub: string) => request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub, tenantId: TENANT })}`);
    buyer = agent('sup14-buyer'); manager = agent('sup14-manager'); seeder = agent('sup14-seed');

    // The governed rate the comparison will use. The whole point of the spec is that this rate
    // shapes the DECISION and never reaches the order.
    await app.get(ExchangeRateService).setRate(TENANT, 'USD', 'AED', 3.6725, new Date('2026-03-01'));

    const project = await post<{ id: string }>(seeder, '/api/v1/projects/projects', { title: `SUP-14 ${Date.now()}` });
    const pr = await post<{ id: string }>(buyer, '/api/v1/procurement/purchase-requests', { title: 'Cameras and cable', projectId: project.id, value: 0 });
    for (const [code, name] of [['CAM', '4MP dome camera'], ['CBL', 'Cat-6A cable']]) {
      const material = await post<{ id: string }>(seeder, '/api/v1/inventory/materials', { code: `${code}-${Date.now()}`, name, uom: 'nr' });
      const line = await post<{ id: string }>(buyer, `/api/v1/procurement/purchase-requests/${pr.id}/lines`, {
        material: material.id, quantity: 10, estimatedUnitCost: 400,
      });
      prLineIds.push(line.id);
    }
    const rfq = await post<{ id: string }>(buyer, '/api/v1/procurement/rfqs', { title: 'Cameras and cable', prId: pr.id });
    rfqId = rfq.id;

    /** A supplier's confirmed offer, quoted in their own currency with their own terms. */
    const quote = async (supplierName: string, currency: string, unitPrices: [number, number], terms: Record<string, unknown>, discounts?: [number, number]) => {
      const { baseOffer } = await post<{ baseOffer: { id: string } }>(buyer, '/api/v1/procurement/quotations/families', {
        rfqId, supplierName, supplierQuotationRef: `${supplierName.toUpperCase()}-Q-4471`,
      });
      const revision = await post<{ id: string }>(buyer, `/api/v1/procurement/quotations/offers/${baseOffer.id}/revisions`, {
        currency, taxTreatment: 'exclusive', taxRatePct: 5, validityDate: '2026-12-31', ...terms,
      });
      for (const [i, prLineId] of prLineIds.entries()) {
        await post(buyer, `/api/v1/procurement/quotations/revisions/${revision.id}/lines`, {
          prLineId, quantity: 10, uom: 'nr', unitPrice: unitPrices[i],
          ...(discounts?.[i] ? { lineDiscount: discounts[i] } : {}),
          offeredManufacturer: `${supplierName} Industries`, offeredModel: `M-${i + 1}`,
        });
      }
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${revision.id}/status`).send({ status: 'received' }).expect(200);
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${revision.id}/status`).send({ status: 'confirmed' }).expect(200);

      const lines = (await seeder.get(`/api/v1/procurement/quotations/revisions/${revision.id}/lines`)).body as Array<{ id: string }>;
      for (const line of lines) {
        await post(seeder, `/api/v1/procurement/quotation-lines/${line.id}/evaluation`, {
          verdict: 'compliant', rationale: 'meets the specification',
        });
      }
      offers[supplierName] = { offerId: baseOffer.id, revisionId: revision.id };
    };

    // Dallas quotes USD: 100 + 250 a unit × 10 = USD 3,500, freight USD 200, payment 30 days net.
    //   Compared in AED at 3.6725 → 3,500 × 3.6725 = AED 12,853.75, plus freight AED 734.50.
    await quote('Dallas Systems', 'USD', [100, 250], { freightAmount: 200, freightTerms: 'DAP Dubai', paymentTerms: '30 days net' });
    // Gulf quotes AED: 400 + 950 a unit × 10 = AED 13,500. Dearer, and needs a reason to be chosen.
    await quote('Gulf Cables', 'AED', [400, 950], { paymentTerms: '60 days net' });
    /**
     * Sharjah quotes a LINE DISCOUNT — the case the award used to refuse outright (PO-01).
     *   line 1  10 x AED 500 = 5,000 less 1,000 = AED 4,000
     *   line 2  10 x AED 1,000 = 10,000 less 3,000 = AED 7,000
     * so AED 11,000 in total, which is also the cheapest offer here — deliberately, because a
     * refusal that only bites on offers nobody would choose proves nothing.
     */
    await quote('Sharjah Supply', 'AED', [500, 1_000], { paymentTerms: '45 days net' }, [1_000, 3_000]);
  }, 60_000);

  afterAll(async () => { await app?.close(); });

  /**
   * Dallas compares at AED 13,588.30 against Gulf's AED 13,500, so it is NOT the cheapest and every
   * recommendation for it records why. That is the fixture being honest rather than convenient: the
   * case worth proving is a supplier chosen on merit and ordered from in their own currency.
   */
  const DALLAS_REASON = { reasonCode: 'better_warranty', reason: 'five years on site against Gulf’s one' };

  const recommend = async (body: Record<string, unknown>) =>
    buyer.post(`/api/v1/procurement/rfqs/${rfqId}/recommendation`).send({ comparisonDate: COMPARISON_DATE, ...body });

  /** Prepare → submit → approve, returning the recommendation id. */
  const approved = async (body: Record<string, unknown>): Promise<string> => {
    const prepared = await recommend(body);
    expect(prepared.status, JSON.stringify(prepared.body)).toBe(201);
    const id = prepared.body.recommendation.id as string;
    await buyer.post(`/api/v1/procurement/rfqs/recommendations/${id}/submit`).expect(201);
    const decision = await manager.post(`/api/v1/procurement/rfqs/recommendations/${id}/decision`).send({ decision: 'approved' });
    expect(decision.status, JSON.stringify(decision.body)).toBe(201);
    return id;
  };

  /**
   * ONE LIVE RECOMMENDATION PER RFQ is a real rule, so each case stands the previous one down. The
   * Manager does it because an approved recommendation can only be withdrawn by somebody who could
   * have approved it — and an approved one has no other way out, which is the deadlock SUP-14's
   * staleness refusal would otherwise have created.
   */
  const clearLive = async () => {
    const existing = await buyer.get(`/api/v1/procurement/rfqs/${rfqId}/recommendations`);
    for (const r of (existing.body as Array<{ id: string; status: string }>) ?? []) {
      if (['draft', 'submitted', 'approved', 'returned'].includes(r.status)) {
        const done = await manager.post(`/api/v1/procurement/rfqs/recommendations/${r.id}/withdraw`)
          .send({ reason: 'superseded by the next case' });
        expect(done.status, JSON.stringify(done.body)).toBe(201);
        /**
         * A WITHDRAWAL DOES NOT ERASE THE DECISION. Standing down an APPROVED recommendation used to
         * be written into the fields that record who approved it, so the approval disappeared from
         * the only place it was kept. Both acts are recorded now, and this asserts it on every pass
         * of the loop — including the ones clearing an approved recommendation.
         */
        expect(done.body).toMatchObject({ status: 'withdrawn', withdrawnBy: 'sup14-manager' });
        expect(done.body.withdrawalReason).toBe('superseded by the next case');
        if (r.status === 'approved') {
          expect(done.body.decidedBy, 'the approver must survive the withdrawal').toBeTruthy();
          expect(done.body.decidedAt).toBeTruthy();
        }
      }
    }
  };

  it('the comparison values the USD offer in AED — which is what the DECISION is made on', async () => {
    const res = await buyer.get(`/api/v1/procurement/rfqs/${rfqId}/recommendation/candidates`)
      .query({ comparisonDate: COMPARISON_DATE }).expect(200);
    const dallas = res.body.candidates.find((c: { supplierName: string }) => c.supplierName === 'Dallas Systems');

    /**
     * THE COMPARISON RECONCILES WITH THE SUPPLIER'S OWN FIGURES, to the fils:
     *
     *   line 1   USD 100 x 10 = 1,000                     -> x 3.6725 = AED  3,672.50
     *   line 2   USD 250 x 10 = 2,500                     -> x 3.6725 = AED  9,181.25
     *   freight  USD 200                                  -> x 3.6725 = AED    734.50
     *                                                                 ───────────────
     *   USD 3,700 x 3.6725                                           = AED 13,588.25
     *
     * It once read 13,588.30, because the conversion rounded the UNIT price and then multiplied:
     * 250 x 3.6725 = 918.125 -> 918.13 -> x 10 = 9,181.30. Five fils, growing with the quantity and
     * always favouring whichever supplier's unit price rounds up — and the wrong figure was not just
     * displayed, it was STORED as the value the approval was given against. A recommendation is a
     * comparison between offers, so that is a decision changed by arithmetic nobody chose.
     */
    expect(dallas.wholeOfferTotal).toMatchObject({ status: 'known', currency: 'AED', includesFreight: true });
    expect(dallas.wholeOfferTotal.value).toBe(13_588.25);
    // The supplier's own total, converted once, is exactly what the comparison says.
    expect(dallas.wholeOfferTotal.value).toBe(Number((3_700 * 3.6725).toFixed(2)));
    // And the offer still says, separately, what it was actually quoted in.
    expect(dallas.currency).toBe('USD');
  });

  describe('what the award refuses', () => {
    it('a recommendation that nobody has approved', async () => {
      await clearLive();
      const prepared = await recommend({ mode: 'single_supplier', ...DALLAS_REASON, selections: [{ offerId: offers['Dallas Systems'].offerId, coveredPrLineIds: prLineIds }] });
      expect(prepared.status, JSON.stringify(prepared.body)).toBe(201);
      const id = prepared.body.recommendation.id as string;

      // 409, not 400: the request is well formed and the caller is entitled to make it — the
      // recommendation is simply in a state that has no award in it yet.
      const refused = await manager.post(`/api/v1/procurement/rfqs/recommendations/${id}/award`);
      expect(refused.status).toBe(409);
      expect(JSON.stringify(refused.body)).toMatch(/a draft recommendation cannot be awarded/);
    });

    it('a Buyer executing it — the award permission is the Manager’s', async () => {
      await clearLive();
      const id = await approved({ mode: 'single_supplier', ...DALLAS_REASON, selections: [{ offerId: offers['Dallas Systems'].offerId, coveredPrLineIds: prLineIds }] });
      await buyer.post(`/api/v1/procurement/rfqs/recommendations/${id}/award`).expect(403);
    });

    it('one that has gone stale because the supplier sent a newer revision', async () => {
      await clearLive();
      // Gulf is not the cheapest either, now that Sharjah quotes a discount — so this records why.
      const id = await approved({
        mode: 'single_supplier', reasonCode: 'lower_project_risk', reason: 'Gulf has supplied this tower before',
        selections: [{ offerId: offers['Gulf Cables'].offerId, coveredPrLineIds: prLineIds }],
      });

      // Gulf sends a revised offer AFTER approval. Nobody has reviewed it, so awarding would place
      // an order on terms that were never looked at.
      const revision = await post<{ id: string }>(buyer, `/api/v1/procurement/quotations/offers/${offers['Gulf Cables'].offerId}/revisions`, {
        currency: 'AED', taxTreatment: 'exclusive', taxRatePct: 5, validityDate: '2026-12-31', paymentTerms: '60 days net',
      });
      for (const [i, prLineId] of prLineIds.entries()) {
        await post(buyer, `/api/v1/procurement/quotations/revisions/${revision.id}/lines`, {
          prLineId, quantity: 10, uom: 'nr', unitPrice: i === 0 ? 380 : 900,
        });
      }
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${revision.id}/status`).send({ status: 'received' }).expect(200);
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${revision.id}/status`).send({ status: 'confirmed' }).expect(200);
      // Its own verdict: SUP-01's judgement on the superseded revision was about a different offer.
      const newLines = (await seeder.get(`/api/v1/procurement/quotations/revisions/${revision.id}/lines`)).body as Array<{ id: string }>;
      for (const line of newLines) {
        await post(seeder, `/api/v1/procurement/quotation-lines/${line.id}/evaluation`, { verdict: 'compliant', rationale: 'meets the specification' });
      }
      offers['Gulf Cables'].revisionId = revision.id;

      const refused = await manager.post(`/api/v1/procurement/rfqs/recommendations/${id}/award`);
      expect(refused.status).toBe(400);
      expect(JSON.stringify(refused.body)).toMatch(/out of date and cannot be awarded/);
    });
  });

  it('the legacy award route refuses, and says where the award went', async () => {
    const refused = await manager.patch(`/api/v1/procurement/rfqs/${rfqId}/award`).send({ quoteId: 'anything' });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toMatch(/recommendations\/:id\/award/);
  });

  it('turns the approved USD offer into a USD purchase order, at the prices the supplier quoted', async () => {
    await clearLive();
    const id = await approved({
      mode: 'single_supplier', ...DALLAS_REASON,
      selections: [{ offerId: offers['Dallas Systems'].offerId, coveredPrLineIds: prLineIds }],
    });

    const res = await manager.post(`/api/v1/procurement/rfqs/recommendations/${id}/award`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.orders).toHaveLength(1);
    const [order] = res.body.orders as Array<Record<string, unknown>>;

    /**
     * THE HEADING OF THIS WHOLE RECORD. The decision was made on AED 13,588.25. The order is for
     * USD 3,500 — the lines, in the supplier's own currency. Not the comparison figure, and not the
     * comparison figure converted back, which would round its way to a third number.
     */
    expect(order.currency).toBe('USD');
    expect(order.value).toBe(3_500);
    expect(order.value).not.toBe(13_588.25);

    // The supplier's own terms, carried across rather than retyped.
    expect(order).toMatchObject({
      taxTreatment: 'exclusive', taxRatePct: 5,
      freightAmount: 200, freightTerms: 'DAP Dubai', paymentTerms: '30 days net',
      supplierQuotationRef: 'DALLAS SYSTEMS-Q-4471',
      sourcingRecommendationId: id,
      quotationRevisionId: offers['Dallas Systems'].revisionId,
      rfqId,
    });
    // Freight is on the header beside the value, NOT inside it and NOT spread across the lines.
    expect(order.value).not.toBe(3_700);

    // …and it has real lines, which is what the legacy award never produced.
    const lines = (await manager.get(`/api/v1/procurement/purchase-orders/${order.id}/lines`).expect(200)).body as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.unitPrice)).toEqual([100, 250]);
    expect(lines.every((l) => l.sourceType === 'sourced')).toBe(true);
    expect(lines.every((l) => l.unitPriceBasis === 'agreed')).toBe(true);
    // Every line names the requisition line it answers and the quotation line it was priced from.
    expect(lines.every((l) => Boolean(l.sourcePrLineId) && Boolean(l.sourceQuoteLineId))).toBe(true);
    // The MAKE AND MODEL THE SUPPLIER OFFERED — the order is for what was quoted and accepted.
    expect(lines[0].manufacturer).toBe('Dallas Systems Industries');

    // The order's own summary agrees with its header: one total, not two that can disagree.
    const summary = (await manager.get(`/api/v1/procurement/purchase-orders/${order.id}/lines/summary`).expect(200)).body;
    expect(summary.total.value).toBe(order.value);
    expect(summary.provenance).toBe('sourced');

    // And the recommendation is closed out as awarded, so it cannot be awarded twice.
    const after = await manager.post(`/api/v1/procurement/rfqs/recommendations/${id}/award`);
    expect(after.status).toBe(409);
    expect(JSON.stringify(after.body)).toMatch(/an awarded recommendation cannot be awarded/);
  });

  /**
   * PO-01 — A DISCOUNTED OFFER REACHES A PURCHASE ORDER WITH NOTHING LOST.
   *
   * The award used to refuse this outright, and that refusal was honest but incomplete: the
   * quotation model captures a line discount and the comparison honours it, so a perfectly valid
   * offer could be compared, recommended, approved — and then not awarded. The order line carries a
   * discount of its own now, beside the gross unit price rather than folded into it, so the supplier
   * will invoice the same per-unit figure they quoted and the three-way match still compares like
   * with like.
   */
  it('awards a DISCOUNTED offer, keeping the gross price, the discount and what the line is worth', async () => {
    await clearLive();
    // AED 11,000 against Dallas's 13,588.25 and Gulf's 13,500 — the cheapest, so no reason is owed.
    const id = await approved({
      mode: 'single_supplier',
      selections: [{ offerId: offers['Sharjah Supply'].offerId, coveredPrLineIds: prLineIds }],
    });

    const res = await manager.post(`/api/v1/procurement/rfqs/recommendations/${id}/award`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const [order] = res.body.orders as Array<Record<string, unknown>>;

    // The order is worth what the lines are worth AFTER their discounts: 4,000 + 7,000.
    expect(order.value).toBe(11_000);
    expect(order.currency).toBe('AED');

    const lines = (await manager.get(`/api/v1/procurement/purchase-orders/${order.id}/lines`).expect(200))
      .body as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(2);
    // THE GROSS UNIT PRICE SURVIVES — it is what the supplier prints on their invoice line.
    expect(lines.map((l) => l.unitPrice)).toEqual([500, 1_000]);
    // …and the discount travels beside it rather than being folded in or dropped.
    expect(lines.map((l) => l.lineDiscount)).toEqual([1_000, 3_000]);
    // Its provenance is the quotation line it came from, still readable.
    expect(lines.every((l) => Boolean(l.sourceQuoteLineId))).toBe(true);

    // One total, not two: the summary derived from the lines equals the header.
    const summary = (await manager.get(`/api/v1/procurement/purchase-orders/${order.id}/lines/summary`).expect(200)).body;
    expect(summary.total.value).toBe(11_000);
  });

  it('a split award produces one purchase order per supplier, each in its own currency', async () => {
    await clearLive();
    const id = await approved({
      mode: 'split_award',
      reasonCode: 'lower_project_risk',
      reason: 'cameras from Dallas, cable from Gulf — dual sourcing for continuity',
      selections: [
        { offerId: offers['Dallas Systems'].offerId, coveredPrLineIds: [prLineIds[0]] },
        { offerId: offers['Gulf Cables'].offerId, coveredPrLineIds: [prLineIds[1]] },
      ],
    });

    const res = await manager.post(`/api/v1/procurement/rfqs/recommendations/${id}/award`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const orders = res.body.orders as Array<Record<string, unknown>>;
    expect(orders).toHaveLength(2);

    const dallas = orders.find((o) => o.supplierName === 'Dallas Systems')!;
    const gulf = orders.find((o) => o.supplierName === 'Gulf Cables')!;

    // TWO CURRENCIES, side by side, because that is what was actually agreed with each supplier.
    expect(dallas.currency).toBe('USD');
    expect(dallas.value).toBe(1_000);   // 10 cameras at USD 100
    expect(gulf.currency).toBe('AED');
    expect(gulf.value).toBe(9_000);     // 10 cable runs at AED 900 — Gulf's CURRENT revision

    // Each order carries only its own supplier's share of the requisition.
    for (const order of [dallas, gulf]) {
      const lines = (await manager.get(`/api/v1/procurement/purchase-orders/${order.id}/lines`).expect(200)).body as unknown[];
      expect(lines).toHaveLength(1);
    }
  });
});
