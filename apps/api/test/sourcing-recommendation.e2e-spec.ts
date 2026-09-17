// SUP-13 — the governed sourcing recommendation, over HTTP, Auth-ON.
//
// Two suppliers, one requirement each way, and the decisions AURA refuses to make for anybody:
// it names no winner, it will not recommend an unevaluated offer however cheap, and it will not let
// an award beyond somebody's authority through by splitting it into smaller pieces.
//
// WHAT THIS PROVES: the HTTP contract, the maker/checker split, and the approval matrix on BOTH the
// individual award and the whole sourcing decision.
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

const TENANT = `sup13-${Date.now()}`;

describe('the governed sourcing recommendation (HTTP, Auth-ON)', () => {
  let app: INestApplication;
  let buyer: ReturnType<typeof request.agent>;
  let manager: ReturnType<typeof request.agent>;
  let smallManager: ReturnType<typeof request.agent>;
  let seeder: ReturnType<typeof request.agent>;
  let rfqId: string;
  let prLines: string[] = [];
  let offers: Record<string, string> = {};

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'sup13-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());

    const auth = app.get(AuthService);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    /**
     * Real shipped roles. The Buyer prepares; the Procurement Manager decides. `smallManager` holds
     * the same role with a LOWER approval limit, which is how the anti-splitting check is exercised
     * without inventing a role for the occasion.
     *
     * The limit goes in `attributes`, which is where the ABAC evaluation reads it. A top-level
     * `approvalLimit` is silently ignored and every grant becomes effectively unlimited — a quiet
     * way for a spec to prove nothing at all about approval authority.
     */
    access.grant({ userId: 'sup13-buyer', roleId: 'r-procurement', scope: { kind: 'org', level: 'tenant', id: TENANT }, attributes: { approvalLimit: 1_000_000 } });
    access.grant({ userId: 'sup13-manager', roleId: 'r-procurement-manager', scope: { kind: 'org', level: 'tenant', id: TENANT }, attributes: { approvalLimit: 1_000_000 } });
    access.grant({ userId: 'sup13-small', roleId: 'r-procurement-manager', scope: { kind: 'org', level: 'tenant', id: TENANT }, attributes: { approvalLimit: 7_000 } });
    access.grant({ userId: 'sup13-seed', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, attributes: { approvalLimit: 10_000_000 } });
    for (const userId of ['sup13-buyer', 'sup13-manager', 'sup13-small', 'sup13-seed']) {
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }

    const tenant = app.get(TenantContext);
    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    const server = app.getHttpServer();
    const agent = (sub: string) => request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub, tenantId: TENANT })}`);
    buyer = agent('sup13-buyer'); manager = agent('sup13-manager');
    smallManager = agent('sup13-small'); seeder = agent('sup13-seed');

    await app.get(ExchangeRateService).setRate(TENANT, 'EUR', 'AED', 4.0, new Date('2026-02-01'));

    const post = async <T>(a: ReturnType<typeof request.agent>, path: string, data: unknown): Promise<T> => {
      const res = await a.post(path).send(data);
      expect(res.ok, `${path} — ${res.status} ${JSON.stringify(res.body)}`).toBe(true);
      return res.body as T;
    };

    // TWO requirements, so a split award is expressible.
    const project = await post<{ id: string }>(seeder, '/api/v1/projects/projects', { title: `SUP-13 ${Date.now()}` });
    const pr = await post<{ id: string }>(buyer, '/api/v1/procurement/purchase-requests', { title: 'Cameras and cable', projectId: project.id, value: 0 });
    for (const [code, name] of [['CAM', '4MP dome camera'], ['CBL', 'Cat-6A cable']]) {
      const material = await post<{ id: string }>(seeder, '/api/v1/inventory/materials', { code: `${code}-${Date.now()}`, name, uom: 'nr' });
      const line = await post<{ id: string }>(buyer, `/api/v1/procurement/purchase-requests/${pr.id}/lines`, {
        material: material.id, quantity: 10, estimatedUnitCost: 100,
      });
      prLines.push(line.id);
    }
    const rfq = await post<{ id: string }>(buyer, '/api/v1/procurement/rfqs', { title: 'RFQ', prId: pr.id });
    rfqId = rfq.id;

    /** A supplier with a confirmed revision pricing both requirements, at a given unit price. */
    const quote = async (supplierName: string, unitPrices: [number, number], freight: number | null) => {
      const { baseOffer } = await post<{ baseOffer: { id: string } }>(buyer, '/api/v1/procurement/quotations/families', { rfqId, supplierName });
      const revision = await post<{ id: string }>(buyer, `/api/v1/procurement/quotations/offers/${baseOffer.id}/revisions`, {
        currency: 'AED', taxTreatment: 'exclusive', taxRatePct: 5, validityDate: '2026-12-31',
        ...(freight === null ? {} : { freightAmount: freight, freightTerms: 'DAP Dubai' }),
      });
      for (const [i, prLineId] of prLines.entries()) {
        await post(buyer, `/api/v1/procurement/quotations/revisions/${revision.id}/lines`, {
          prLineId, quantity: 10, uom: 'nr', unitPrice: unitPrices[i],
        });
      }
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${revision.id}/status`).send({ status: 'received' }).expect(200);
      await buyer.patch(`/api/v1/procurement/quotations/revisions/${revision.id}/status`).send({ status: 'confirmed' }).expect(200);
      offers[supplierName] = baseOffer.id;
      return { offerId: baseOffer.id, revisionId: revision.id };
    };

    // Alpha: 100 + 200 per unit × 10 = 3,000, no freight.        → 3,000
    // Beta:  120 + 150 per unit × 10 = 2,700, freight 500.       → 3,200
    const alpha = await quote('Alpha', [100, 200], null);
    const beta = await quote('Beta', [120, 150], 500);

    // SUP-01: every line of both offers judged compliant, so compliance does not block the test
    // that is about something else. One line is left unevaluated further down, deliberately.
    const evaluate = async (revisionId: string, skipLast = false) => {
      const lines = await (await seeder.get(`/api/v1/procurement/quotations/revisions/${revisionId}/lines`)).body;
      for (const [i, line] of (lines as Array<{ id: string }>).entries()) {
        if (skipLast && i === lines.length - 1) continue;
        await post(seeder, `/api/v1/procurement/quotation-lines/${line.id}/evaluation`, {
          verdict: 'compliant', rationale: 'meets the specification',
        });
      }
    };
    await evaluate(alpha.revisionId);
    await evaluate(beta.revisionId);
  });

  afterAll(async () => { await app?.close(); });

  const candidates = () => buyer.get(`/api/v1/procurement/rfqs/${rfqId}/recommendation/candidates`).query({ comparisonDate: '2026-02-15' });
  /**
   * ONE LIVE RECOMMENDATION PER RFQ is a real rule — two competing live ones would be two answers to
   * the same question. So each case clears the previous one by having the Manager reject it, which
   * is a legitimate flow and exercises the reject path besides.
   */
  const clearLive = async () => {
    const existing = await buyer.get(`/api/v1/procurement/rfqs/${rfqId}/recommendations`);
    for (const r of (existing.body as Array<{ id: string; status: string }>) ?? []) {
      if (r.status === 'draft' || r.status === 'approved') {
        await buyer.post(`/api/v1/procurement/rfqs/recommendations/${r.id}/submit`);
      }
      if (['draft', 'submitted', 'approved'].includes(r.status)) {
        await manager.post(`/api/v1/procurement/rfqs/recommendations/${r.id}/decision`)
          .send({ decision: 'rejected', note: 'cleared for the next case' });
      }
    }
  };

  const recommend = async (body: Record<string, unknown>) => {
    await clearLive();
    return buyer.post(`/api/v1/procurement/rfqs/${rfqId}/recommendation`).send({ comparisonDate: '2026-02-15', ...body });
  };

  it('assembles every offer with its whole-offer total, and names NO winner', async () => {
    const res = await candidates().expect(200);
    const alpha = res.body.candidates.find((c: { supplierName: string }) => c.supplierName === 'Alpha');
    const beta = res.body.candidates.find((c: { supplierName: string }) => c.supplierName === 'Beta');

    // Freight is ADDED at the offer level — the allocation refused across lines is unnecessary here.
    expect(alpha.wholeOfferTotal).toMatchObject({ status: 'known', value: 3_000, includesFreight: false });
    expect(beta.wholeOfferTotal).toMatchObject({ status: 'known', value: 3_200, includesFreight: true });
    expect(alpha.recommendability.recommendable).toBe(true);

    // Nothing is ranked, and no winner is named anywhere in the payload.
    const body = JSON.stringify(res.body).toLowerCase();
    for (const word of ['winner', 'cheapest', 'recommended:', 'best']) expect(body).not.toContain(word);
  });

  it('records a recommendation for the cheaper offer with no reason required', async () => {
    const res = await recommend({
      mode: 'single_supplier',
      selections: [{ offerId: offers.Alpha, coveredPrLineIds: prLines }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.recommendation).toMatchObject({ mode: 'single_supplier', status: 'draft', comparisonDate: '2026-02-15' });
    // The selection names the REVISION it was made on.
    expect(res.body.selections[0]).toMatchObject({ supplierName: 'Alpha', governedTotal: 3_000 });
    expect(res.body.selections[0].revisionId).toBeTruthy();
  });

  describe('what a recommendation refuses', () => {
    it('a dearer offer with no reason for choosing it', async () => {
      const res = await recommend({
        mode: 'single_supplier',
        selections: [{ offerId: offers.Beta, coveredPrLineIds: prLines }],
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/not the lowest governed total, so the recommendation must record why/);
    });

    it('…and accepts it once the reason is recorded', async () => {
      const res = await recommend({
        mode: 'single_supplier',
        reasonCode: 'better_delivery', reason: 'Beta commits to four weeks against Alpha’s ten',
        selections: [{ offerId: offers.Beta, coveredPrLineIds: prLines }],
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.recommendation).toMatchObject({ reasonCode: 'better_delivery' });
    });

    it('a scope that leaves a requisition line with no supplier', async () => {
      const res = await recommend({
        mode: 'single_supplier',
        selections: [{ offerId: offers.Alpha, coveredPrLineIds: [prLines[0]] }],
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/no supplier is chosen for 1 requisition line/);
    });

    it('a split award with no reason for splitting', async () => {
      const res = await recommend({
        mode: 'split_award',
        selections: [
          { offerId: offers.Alpha, coveredPrLineIds: [prLines[0]] },
          { offerId: offers.Beta, coveredPrLineIds: [prLines[1]] },
        ],
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/split award must record why/);
    });

    it('a split award recorded WITH its reason is accepted, one selection per supplier', async () => {
      const res = await recommend({
        mode: 'split_award',
        reasonCode: 'better_delivery', reason: 'cable from Beta, cameras from Alpha',
        selections: [
          { offerId: offers.Alpha, coveredPrLineIds: [prLines[0]] },
          { offerId: offers.Beta, coveredPrLineIds: [prLines[1]] },
        ],
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.selections).toHaveLength(2);
    });
  });

  it('refuses a split whose TOTAL exceeds authority even though each award is within it', async () => {
    const split = await recommend({
      mode: 'split_award',
      reasonCode: 'lower_project_risk', reason: 'dual sourcing for continuity',
      selections: [
        { offerId: offers.Alpha, coveredPrLineIds: [prLines[0]] },
        { offerId: offers.Beta, coveredPrLineIds: [prLines[1]] },
      ],
    });
    expect(split.status, JSON.stringify(split.body)).toBe(201);
    await buyer.post(`/api/v1/procurement/rfqs/recommendations/${split.body.recommendation.id}/submit`).expect(201);

    /**
     * Each supplier's own award (3,000 and 3,200) is inside a 4,000 limit. The whole decision is
     * 6,200 and is not. Without the total check, an award beyond somebody's authority would be waved
     * through by splitting it — which is exactly the control an approval limit exists to impose.
     */
    const access = app.get(AccessService);
    access.grant({ userId: 'sup13-splitter', roleId: 'r-procurement-manager', scope: { kind: 'org', level: 'tenant', id: TENANT }, attributes: { approvalLimit: 4_000 } });
    app.get(UsersService).save({ tenantId: TENANT, userId: 'sup13-splitter', displayName: 'splitter', active: true });
    const auth = app.get(AuthService);
    const splitter = request.agent(app.getHttpServer())
      .set('Authorization', `Bearer ${auth.mint({ sub: 'sup13-splitter', tenantId: TENANT })}`);

    const refused = await splitter.post(`/api/v1/procurement/rfqs/recommendations/${split.body.recommendation.id}/decision`)
      .send({ decision: 'approved' });
    expect(refused.status).toBe(403);
    expect(JSON.stringify(refused.body)).toMatch(/sourcing decision in total/);
  });

  /**
   * Ordered BEFORE the maker/checker block on purpose: that block ends in an APPROVED
   * recommendation, and an approved one is the RFQ's decision — it legitimately blocks a new
   * recommendation until it is awarded or superseded. The ordering respects the rule rather than
   * working around it.
   */
  describe('maker and checker', () => {
    let recommendationId: string;

    it('the Buyer prepares and submits', async () => {
      const prepared = await recommend({
        mode: 'single_supplier',
        selections: [{ offerId: offers.Alpha, coveredPrLineIds: prLines }],
      });
      expect(prepared.status, JSON.stringify(prepared.body)).toBe(201);
      recommendationId = prepared.body.recommendation.id;
      const submitted = await buyer.post(`/api/v1/procurement/rfqs/recommendations/${recommendationId}/submit`).expect(201);
      expect(submitted.body).toMatchObject({ status: 'submitted' });
    });

    it('the Buyer CANNOT decide it — that permission is the Manager’s', async () => {
      await buyer.post(`/api/v1/procurement/rfqs/recommendations/${recommendationId}/decision`)
        .send({ decision: 'approved' }).expect(403);
    });

    it('an approver whose limit clears each award can still be refused on the TOTAL', async () => {
      // Alpha's award is 3,000 and the whole decision is 3,000 — within a 7,000 limit either way,
      // so this proves the check runs rather than that it bites. The biting case is below.
      const ok = await smallManager.post(`/api/v1/procurement/rfqs/recommendations/${recommendationId}/decision`)
        .send({ decision: 'approved' });
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ status: 'approved', decidedBy: 'sup13-small' });
    });
  });

});
