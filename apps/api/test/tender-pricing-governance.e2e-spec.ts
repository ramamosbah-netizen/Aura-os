// AURA OS — tender pricing sheet governance e2e (HTTP).
//
// The tender estimate is the costing that JUSTIFIES the quotation generated from it. Once that
// quotation is committed to the client (approved onwards), the costing is frozen — otherwise the
// justification for a price we are standing behind could be rewritten after the fact. And it is
// frozen earlier still, from the moment a reviewer is asked to decide on it (EST-17: approvers
// "review the same frozen build-up"). One rule — TenderPricingLock — holds both, on the pricing sheet
// and on the legacy `POST /tendering/estimates` route alike. This mirrors the quotation sheet's own
// lock; together they mean there is no editable path to a committed or reviewed price.
//
// The tenders here are priced on the governed basis — an independently approved technical study and
// an approved quantity take-off projected to the BOQ — as pricing requires (governedPricingContext);
// see governed-tender.fixture.ts.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import {
  TENDER_TEAM,
  generateTenderOffer,
  governTenderBasis,
  grantTenderTeam,
  repriceTenderItem,
  satisfyOfferChecklist,
} from './governed-tender.fixture';

const TENANT = 'tpg-tenant';

describe('tender pricing governance e2e (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    // Mirror main.ts — without the taxonomy filter the governance guard escapes as a 500 and the
    // spec would assert the wrong contract (the trap that hid this in the quotation sheet's spec).
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    grantTenderTeam(app, TENANT);
    // The actor is per-request, via a header only the governed acts send — so every other call in
    // this spec runs as it always has.
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: TENANT, companyId: null, actorId: (_req as { headers?: Record<string, string> }).headers?.['x-e2e-actor'] ?? null, correlationId: 'e2e-tpg' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  /** A tender with one BOQ item priced on the governed basis (supply at 300), ready to generate an offer. */
  const pricedTender = async (title: string): Promise<{ tenderId: string; itemId: string }> => {
    const tender = (await http.post('/api/v1/tendering/tenders').send({ title, value: 100_000 }).expect(201)).body as { id: string };
    const { itemId } = await governTenderBasis(http, tender.id, { description: 'CCTV camera', unit: 'no', quantity: 10 }, 300);
    return { tenderId: tender.id, itemId };
  };

  const setOffer = (quoteId: string, action: string, over: { reason?: string; actor?: string } = {}) => {
    const req = http.patch(`/api/v1/crm/quotations/${quoteId}/status`);
    return (over.actor ? req.set('x-e2e-actor', over.actor) : req).send({ action, ...(over.reason ? { reason: over.reason } : {}) });
  };

  /** The legacy composition route re-works the same costing, and obeys the same lock. */
  const legacyRate = (itemId: string, unitCost: number) =>
    http.post('/api/v1/tendering/estimates').set('x-e2e-actor', TENDER_TEAM.estimator)
      .send({ boqItemId: itemId, components: [{ costType: 'material', description: 'CCTV camera', quantity: 1, unitCost }], applyToBoq: false });

  it('stays editable while the generated quotation is still a draft', async () => {
    const { tenderId, itemId } = await pricedTender('TPG editable');
    await generateTenderOffer(http, tenderId);

    // A draft quote is no commitment — re-pricing the estimate is legitimate.
    await repriceTenderItem(http, tenderId, itemId, 350).expect(201);
  });

  it('seals the costing while a reviewer decides, on both routes — and reopens on the return', async () => {
    const { tenderId, itemId } = await pricedTender('TPG under review');
    const quote = await generateTenderOffer(http, tenderId);
    await setOffer(quote.id, 'submit_review').expect(200);

    const sheet = await repriceTenderItem(http, tenderId, itemId, 999);
    expect(sheet.status).toBe(409);
    expect(sheet.body.message).toContain('is with a commercial reviewer');
    const legacy = await legacyRate(itemId, 999);
    expect(legacy.status).toBe(409);
    expect(legacy.body.message).toBe(sheet.body.message); // one rule, the same words

    // The reviewer's return is the way out the refusal names — and it reopens the costing.
    await setOffer(quote.id, 'return_for_revision', { actor: TENDER_TEAM.commercialManager, reason: 'Re-rate the cameras' }).expect(200);
    await repriceTenderItem(http, tenderId, itemId, 350).expect(201);
  });

  it('locks the estimate once the generated quotation is approved, and refuses with 409', async () => {
    const { tenderId, itemId } = await pricedTender('TPG approved');
    const quote = await generateTenderOffer(http, tenderId);
    await satisfyOfferChecklist(http, quote.id);
    await setOffer(quote.id, 'approve').expect(200);

    const res = await repriceTenderItem(http, tenderId, itemId, 999);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/locked/i);
    const legacy = await legacyRate(itemId, 999);
    expect(legacy.status).toBe(409);
    expect(legacy.body.message).toContain('committed to the client');
  });

  it('stays locked through sent and accepted — the reported hole', async () => {
    const { tenderId, itemId } = await pricedTender('TPG accepted');
    const quote = await generateTenderOffer(http, tenderId);
    await satisfyOfferChecklist(http, quote.id);
    for (const action of ['approve', 'send', 'accept']) await setOffer(quote.id, action).expect(200);

    await repriceTenderItem(http, tenderId, itemId, 999).expect(409);
    await legacyRate(itemId, 999).expect(409);

    // And the estimate is untouched — refused, not partially applied. (`buildUps` is a map keyed
    // by BOQ item id, not an array.)
    const sheet = (await http.get(`/api/v1/tendering/tenders/${tenderId}/pricing`).expect(200)).body as {
      buildUps: Record<string, { components: Array<{ unitCost: number }> }>;
    };
    const costs = Object.values(sheet.buildUps).flatMap((b) => b.components.map((c) => c.unitCost));
    expect(costs).toContain(300);
    expect(costs).not.toContain(999);
  });

  it('reopens once the committed quote is superseded by a revision', async () => {
    const { tenderId, itemId } = await pricedTender('TPG revised');
    const quote = await generateTenderOffer(http, tenderId);
    await satisfyOfferChecklist(http, quote.id);
    await setOffer(quote.id, 'approve').expect(200);
    await setOffer(quote.id, 'send').expect(200);
    await repriceTenderItem(http, tenderId, itemId, 999).expect(409);

    // A tender offer is revised FROM ITS TENDER, with a reason (EST-16) — never copied in CRM.
    const copy = await http.post(`/api/v1/crm/quotations/${quote.id}/revise`).set('x-e2e-actor', TENDER_TEAM.estimator);
    expect(copy.status).toBe(409);
    expect(copy.body.message).toContain('can only be revised from its tender');

    // Raising the revision is the sanctioned way to re-price: Rev 0 becomes `revised` (superseded,
    // holding no live commitment) and its successor is a draft — so the estimate opens again.
    const rev1 = (await http.post(`/api/v1/tendering/tenders/${tenderId}/quotation/revise`).set('x-e2e-actor', TENDER_TEAM.estimator)
      .send({ reason: 'Client asked for a re-priced camera schedule' }).expect(201)).body as { quoteNumber: string; revision: number };
    expect(rev1).toMatchObject({ quoteNumber: quote.quoteNumber, revision: 1 });
    await repriceTenderItem(http, tenderId, itemId, 350).expect(201);
  });

  it('an accepted quote points at a variation, not a revision (which would be refused)', async () => {
    const { tenderId, itemId } = await pricedTender('TPG accepted-route');
    const quote = await generateTenderOffer(http, tenderId);
    await satisfyOfferChecklist(http, quote.id);
    for (const action of ['approve', 'send', 'accept']) await setOffer(quote.id, action).expect(200);

    const res = await repriceTenderItem(http, tenderId, itemId, 999);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/contract variation/i);
    // The advice must be actionable: revising an accepted offer is genuinely refused — and says why.
    const revise = await http.post(`/api/v1/tendering/tenders/${tenderId}/quotation/revise`).set('x-e2e-actor', TENDER_TEAM.estimator)
      .send({ reason: 'Try to re-price an accepted offer' });
    expect(revise.status).toBe(409);
    expect(revise.body.message).toMatch(/contract variation/i);
  });

  it('a dead quote (rejected) holds no commitment — the estimate stays open for the next bid', async () => {
    const { tenderId, itemId } = await pricedTender('TPG rejected');
    const quote = await generateTenderOffer(http, tenderId);
    await satisfyOfferChecklist(http, quote.id);
    for (const action of ['approve', 'send', 'reject']) await setOffer(quote.id, action).expect(200);

    await repriceTenderItem(http, tenderId, itemId, 350).expect(201);
    await legacyRate(itemId, 350).expect(201);
  });
});
