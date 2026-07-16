// AURA OS — T3 estimation margin & risk layers + the unique estimate (§2.2), e2e (HTTP).
//
// The bid price is a governed roll-up of four named layers — indirect, overhead, RISK
// (contingency, new in T3) and profit — over the direct-cost build-up. And the estimate is
// UNIQUE: one build-up per BOQ item (re-estimating replaces, never duplicates), the estimate is
// the only author of a priced item's rate (hand edits are refused), and deleting the item takes
// its build-up along instead of orphaning it.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('T3 estimate risk layer + unique estimate (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 't3-tenant', companyId: null, actorId: null, correlationId: 'e2e-t3' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  /** A tender with one BOQ item (qty 10 @ manual rate 0), ready for estimating. */
  const tenderWithItem = async () => {
    const tender = (await http.post('/api/v1/tendering/tenders').send({ title: 'Data centre ELV', value: 0 }).expect(201)).body;
    const { boq } = (await http.get(`/api/v1/tendering/tenders/${tender.id}/boq`).expect(200)).body;
    const item = (await http.post(`/api/v1/tendering/tenders/${tender.id}/boq/items`)
      .send({ boqId: boq.id, itemCode: 'ELV-01', description: 'CCTV cameras', unit: 'no', quantity: 10, rate: 0 })
      .expect(201)).body;
    return { tender, boq, item };
  };

  const buildRate = (boqItemId: string, extra: Record<string, unknown> = {}) =>
    http.post('/api/v1/tendering/estimates').send({
      boqItemId,
      components: [{ costType: 'material', description: 'IP camera', quantity: 1, unitCost: 1000 }],
      indirectPercent: 5,
      overheadPercent: 10,
      riskPercent: 4,
      profitPercent: 8,
      ...extra,
    });

  it('the four layers roll up in order: direct → indirect → overhead → risk → profit', async () => {
    const { tender, item } = await tenderWithItem();
    const b = (await buildRate(item.id).expect(201)).body;

    // direct 1000 → indirect 50 → overhead 100 → base 1150 → risk 46 → profit 95.68 → sell 1291.68
    expect(b.directCost).toBe(1000);
    expect(b.indirectAmount).toBe(50);
    expect(b.overheadAmount).toBe(100);
    expect(b.riskAmount).toBe(46);
    expect(b.profitAmount).toBe(95.68);
    expect(b.sellingRate).toBe(1291.68);

    // The tender-level summary carries the risk total (× qty 10).
    const sum = (await http.get(`/api/v1/tendering/estimates/summary?tenderId=${tender.id}`).expect(200)).body;
    expect(sum.totalRisk).toBe(460);
    expect(sum.totalSellingValue).toBe(12916.8);
  });

  it('the estimate is unique — re-estimating the same item replaces the build-up, never duplicates it', async () => {
    const { tender, item } = await tenderWithItem();
    const first = (await buildRate(item.id).expect(201)).body;
    const second = (await buildRate(item.id, { riskPercent: 8 }).expect(201)).body;
    expect(second.id).not.toBe(first.id);

    const list = (await http.get(`/api/v1/tendering/estimates?tenderId=${tender.id}`).expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(second.id);
    expect(list[0].riskPercent).toBe(8);
  });

  it('the estimate is the only author of a priced rate — a hand edit is refused with a 409', async () => {
    const { tender, item } = await tenderWithItem();
    await buildRate(item.id).expect(201);

    const res = await http.put(`/api/v1/tendering/tenders/${tender.id}/boq/items/${item.id}`).send({ rate: 999 });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('only the estimate can reprice');

    // Non-rate fields stay editable; sending the item's CURRENT rate is not a reprice.
    await http.put(`/api/v1/tendering/tenders/${tender.id}/boq/items/${item.id}`)
      .send({ description: 'CCTV cameras (rev A)', rate: item.rate })
      .expect(200);
  });

  it('an unestimated item can still be hand-priced', async () => {
    const { tender, item } = await tenderWithItem();
    const updated = (await http.put(`/api/v1/tendering/tenders/${tender.id}/boq/items/${item.id}`).send({ rate: 250 }).expect(200)).body;
    expect(updated.rate).toBe(250);
  });

  it('deleting a BOQ item takes its build-up along — no orphaned estimates', async () => {
    const { tender, item } = await tenderWithItem();
    await buildRate(item.id).expect(201);
    await http.delete(`/api/v1/tendering/tenders/${tender.id}/boq/items/${item.id}`).expect(200);

    await http.get(`/api/v1/tendering/estimates/boq-item/${item.id}`).expect(404);
    const list = (await http.get(`/api/v1/tendering/estimates?tenderId=${tender.id}`).expect(200)).body;
    expect(list).toHaveLength(0);
  });

  it('applyToBoq writes the governed selling rate onto the BOQ item (and so the tender value)', async () => {
    const { tender, item } = await tenderWithItem();
    await buildRate(item.id, { applyToBoq: true }).expect(201);

    const after = (await http.get(`/api/v1/tendering/tenders/${tender.id}`).expect(200)).body;
    expect(after.value).toBe(12916.8); // 1291.68 × qty 10 — the roll-up, not a hand figure
  });
});
