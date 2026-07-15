// AURA OS — tender pricing sheet governance e2e (HTTP).
//
// The tender estimate is the costing that JUSTIFIES the quotation generated from it. Once that
// quotation is committed to the client (approved onwards), the costing is frozen — otherwise the
// justification for a price we are standing behind could be rewritten after the fact. This mirrors
// the quotation sheet's own lock; together they mean there is no editable path to a committed price.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

interface Tender { id: string }
interface BOQItem { id: string }
interface Quotation { id: string; quoteNumber: string; status: string }

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
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'tpg-tenant', companyId: null, actorId: null, correlationId: 'e2e-tpg' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  /** A tender with one priced BOQ item, ready to generate a quotation from. */
  const pricedTender = async (title: string): Promise<{ tender: Tender; item: BOQItem }> => {
    const tender = (await http.post('/api/v1/tendering/tenders').send({ title, value: 100_000 }).expect(201)).body as Tender;
    const { boq } = (await http.get(`/api/v1/tendering/tenders/${tender.id}/boq`).expect(200)).body as { boq: { id: string } };
    const item = (
      await http.post(`/api/v1/tendering/tenders/${tender.id}/boq/items`).send({
        boqId: boq.id, itemCode: 'E-01', description: 'CCTV camera', unit: 'no', quantity: 10, rate: 0,
      }).expect(201)
    ).body as BOQItem;
    await http.post(`/api/v1/tendering/tenders/${tender.id}/pricing/items/${item.id}`).send({
      resources: { supplyUnitPrice: 300 }, indirectPercent: 10, overheadPercent: 5, profitPercent: 15,
    }).expect(201);
    return { tender, item };
  };

  const generateQuote = async (tenderId: string): Promise<Quotation> =>
    (await http.post(`/api/v1/tendering/tenders/${tenderId}/quotation`).send({}).expect(201)).body as Quotation;

  it('stays editable while the generated quotation is still a draft', async () => {
    const { tender, item } = await pricedTender('TPG editable');
    await generateQuote(tender.id);

    // A draft quote is no commitment — re-pricing the estimate is legitimate.
    await http.post(`/api/v1/tendering/tenders/${tender.id}/pricing/items/${item.id}`).send({
      resources: { supplyUnitPrice: 350 }, profitPercent: 15,
    }).expect(201);
  });

  it('locks the estimate once the generated quotation is approved, and refuses with 409', async () => {
    const { tender, item } = await pricedTender('TPG approved');
    const quote = await generateQuote(tender.id);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'approve' }).expect(200);

    const res = await http.post(`/api/v1/tendering/tenders/${tender.id}/pricing/items/${item.id}`).send({
      resources: { supplyUnitPrice: 999 }, profitPercent: 15,
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/locked/i);
  });

  it('stays locked through sent and accepted — the reported hole', async () => {
    const { tender, item } = await pricedTender('TPG accepted');
    const quote = await generateQuote(tender.id);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'approve' }).expect(200);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'send' }).expect(200);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'accept' }).expect(200);

    await http.post(`/api/v1/tendering/tenders/${tender.id}/pricing/items/${item.id}`).send({
      resources: { supplyUnitPrice: 999 }, profitPercent: 15,
    }).expect(409);

    // And the estimate is untouched — refused, not partially applied. (`buildUps` is a map keyed
    // by BOQ item id, not an array.)
    const sheet = (await http.get(`/api/v1/tendering/tenders/${tender.id}/pricing`).expect(200)).body as {
      buildUps: Record<string, { components: Array<{ unitCost: number }> }>;
    };
    const costs = Object.values(sheet.buildUps).flatMap((b) => b.components.map((c) => c.unitCost));
    expect(costs).toContain(300);
    expect(costs).not.toContain(999);
  });

  it('reopens once the committed quote is superseded by a revision', async () => {
    const { tender, item } = await pricedTender('TPG revised');
    const quote = await generateQuote(tender.id);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'approve' }).expect(200);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'send' }).expect(200);
    await http.post(`/api/v1/tendering/tenders/${tender.id}/pricing/items/${item.id}`)
      .send({ resources: { supplyUnitPrice: 999 }, profitPercent: 15 }).expect(409);

    // Raising a revision is the sanctioned way to re-price: Rev 0 becomes `revised` (superseded,
    // holding no live commitment) and its successor is a draft — so the estimate opens again.
    // (A revision is legal from `sent`, not from `approved` — see reviseQuotation.)
    await http.post(`/api/v1/crm/quotations/${quote.id}/revise`).expect(201);
    await http.post(`/api/v1/tendering/tenders/${tender.id}/pricing/items/${item.id}`)
      .send({ resources: { supplyUnitPrice: 350 }, profitPercent: 15 }).expect(201);
  });

  it('an accepted quote points at a variation, not a revision (which would be refused)', async () => {
    const { tender, item } = await pricedTender('TPG accepted-route');
    const quote = await generateQuote(tender.id);
    for (const action of ['approve', 'send', 'accept']) {
      await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action }).expect(200);
    }
    const res = await http.post(`/api/v1/tendering/tenders/${tender.id}/pricing/items/${item.id}`)
      .send({ resources: { supplyUnitPrice: 999 }, profitPercent: 15 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/contract variation/i);
    // The advice must be actionable: revising an accepted quote is genuinely refused.
    await http.post(`/api/v1/crm/quotations/${quote.id}/revise`).expect(400);
  });

  it('a dead quote (rejected) holds no commitment — the estimate stays open for the next bid', async () => {
    const { tender, item } = await pricedTender('TPG rejected');
    const quote = await generateQuote(tender.id);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'approve' }).expect(200);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'send' }).expect(200);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'reject' }).expect(200);

    await http.post(`/api/v1/tendering/tenders/${tender.id}/pricing/items/${item.id}`)
      .send({ resources: { supplyUnitPrice: 350 }, profitPercent: 15 }).expect(201);
  });
});
