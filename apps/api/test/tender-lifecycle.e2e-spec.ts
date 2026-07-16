// AURA OS — T1 tender lifecycle + gates (§2.2), e2e (HTTP).
//
// The governed lifecycle over the wire: the ungoverned `draft → won` jump that used to be legal is
// now refused, and the only way to a win is through a recorded bid decision, a priced estimate and
// a submission. The gate reads those as facts from the sibling records — the same bid score and
// estimate a human creates through the normal routes.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('T1 tender lifecycle & gates (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 't1-tenant', companyId: null, actorId: null, correlationId: 'e2e-t1' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const newTender = async (value = 500_000) =>
    (await http.post('/api/v1/tendering/tenders').send({ title: 'Marina CCTV package', value }).expect(201)).body;

  const setStatus = (id: string, status: string) =>
    http.patch(`/api/v1/tendering/tenders/${id}/status`).send({ status });

  // Record a bid decision whose weighted score lands on the target recommendation.
  const scoreBid = (tenderId: string, score: number) =>
    http.post('/api/v1/tendering/bid-scores')
      .send({ tenderId, criteria: [{ name: 'fit', weight: 1, score }] })
      .expect(201);

  // Price one BOQ item so `hasPricedEstimate` becomes true. The item carries a real rate — adding a
  // BOQ item recomputes the tender value from the BOQ total, so a zero-rate item would zero the bid
  // value. `applyToBoq: false` keeps that manual rate rather than overwriting it with the build-up.
  const priceOneItem = async (tenderId: string, itemRate = 50_000) => {
    const { boq } = (await http.get(`/api/v1/tendering/tenders/${tenderId}/boq`).expect(200)).body;
    const item = (await http.post(`/api/v1/tendering/tenders/${tenderId}/boq/items`)
      .send({ boqId: boq.id, itemCode: '01', description: 'Cameras', unit: 'no', quantity: 10, rate: itemRate })
      .expect(201)).body;
    await http.post('/api/v1/tendering/estimates')
      .send({ boqItemId: item.id, components: [{ costType: 'material', description: 'IP camera', quantity: 1, unitCost: 1200 }], applyToBoq: false })
      .expect(201);
  };

  it('refuses the old ungoverned jumps — draft cannot go straight to submitted or won', async () => {
    const t = await newTender();

    const toSubmitted = await setStatus(t.id, 'submitted');
    expect(toSubmitted.status).toBe(409); // domain gate → conflict
    expect(toSubmitted.body.message).toContain('bid decision');

    const toWon = await setStatus(t.id, 'won');
    expect(toWon.status).toBe(409);
    expect(toWon.body.message).toContain('Only a submitted bid can be won');

    // The tender did not move.
    const after = (await http.get(`/api/v1/tendering/tenders/${t.id}`).expect(200)).body;
    expect(after.status).toBe('draft');
  });

  it('cannot estimate a tender with no bid decision, or one scored No-Go', async () => {
    const t = await newTender();
    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'qualifying' }).expect(200);

    const noDecision = await setStatus(t.id, 'estimating');
    expect(noDecision.status).toBe(409);
    expect(noDecision.body.message).toContain('Bid/No-Bid decision');

    await scoreBid(t.id, 3); // total 30 → no_go
    const noGo = await setStatus(t.id, 'estimating');
    expect(noGo.status).toBe(409);
    expect(noGo.body.message).toContain('No-Go');
  });

  it('walks the whole governed path draft → … → won, each gate satisfied by real records', async () => {
    const t = await newTender();

    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'qualifying' }).expect(200);

    // Bid decision: score 80 → go.
    await scoreBid(t.id, 8);
    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'estimating' }).expect(200);

    // Cannot claim priced until something is priced.
    expect((await setStatus(t.id, 'priced')).status).toBe(409);
    await priceOneItem(t.id);
    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'priced' }).expect(200);

    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'submitted' }).expect(200);
    const won = (await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'won' }).expect(200)).body;
    expect(won.status).toBe('won');
  });

  it('a zero-value bid cannot be submitted even when scored and priced', async () => {
    const t = await newTender(0);
    await scoreBid(t.id, 8);
    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'estimating' }).expect(200);
    // Zero-rate item keeps the BOQ total — and so the bid value — at 0.
    await priceOneItem(t.id, 0);
    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'priced' }).expect(200);
    const res = await setStatus(t.id, 'submitted');
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('bid value');
  });

  it('declining requires a recorded No-Go, and then it sticks', async () => {
    const t = await newTender();
    // No decision yet → cannot decline.
    expect((await setStatus(t.id, 'declined')).status).toBe(409);

    await scoreBid(t.id, 2); // 20 → no_go
    const declined = (await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'declined' }).expect(200)).body;
    expect(declined.status).toBe('declined');
  });

  it('a step back down the ladder is always allowed — correcting a mistake needs no evidence', async () => {
    const t = await newTender();
    await scoreBid(t.id, 8);
    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'qualifying' }).expect(200);
    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'estimating' }).expect(200);
    // estimating → qualifying (retreat) with no new evidence.
    const back = (await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'qualifying' }).expect(200)).body;
    expect(back.status).toBe('qualifying');
  });
});
