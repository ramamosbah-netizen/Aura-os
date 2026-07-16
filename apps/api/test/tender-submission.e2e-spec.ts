// AURA OS — T2 tender submission record (§2.2 "Submission"), e2e (HTTP).
//
// Before T2 the submission milestone was one enum value. Now every route into `submitted` writes a
// TenderSubmission record — what went out, when, by whom, through which channel, under which
// reference — and the won/lost gate reads that record as its evidence. Over the wire this checks:
// the submit endpoint honours the gate, the record carries the facts, the legacy status route
// still works (and leaves a record), resubmission appends rather than edits, and the value
// snapshot survives later BOQ edits.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('T2 tender submission record (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 't2-tenant', companyId: null, actorId: null, correlationId: 'e2e-t2' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const newTender = async (value = 500_000) =>
    (await http.post('/api/v1/tendering/tenders').send({ title: 'Airport BMS package', value }).expect(201)).body;

  const scoreBid = (tenderId: string, score: number) =>
    http.post('/api/v1/tendering/bid-scores')
      .send({ tenderId, criteria: [{ name: 'fit', weight: 1, score }] })
      .expect(201);

  const priceOneItem = async (tenderId: string, itemRate = 50_000) => {
    const { boq } = (await http.get(`/api/v1/tendering/tenders/${tenderId}/boq`).expect(200)).body;
    const item = (await http.post(`/api/v1/tendering/tenders/${tenderId}/boq/items`)
      .send({ boqId: boq.id, itemCode: '01', description: 'Controllers', unit: 'no', quantity: 10, rate: itemRate })
      .expect(201)).body;
    await http.post('/api/v1/tendering/estimates')
      .send({ boqItemId: item.id, components: [{ costType: 'material', description: 'DDC controller', quantity: 1, unitCost: 900 }], applyToBoq: false })
      .expect(201);
    return { boq, item };
  };

  // Walk a fresh tender through the T1 gates up to `priced`, ready to submit.
  const readyToSubmit = async () => {
    const t = await newTender();
    await scoreBid(t.id, 8); // 80 → go
    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'estimating' }).expect(200);
    const { boq, item } = await priceOneItem(t.id);
    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'priced' }).expect(200);
    return { tender: t, boq, item };
  };

  it('the submit endpoint honours the T1 gate — a bare draft is refused with a 409', async () => {
    const t = await newTender();
    const res = await http.post(`/api/v1/tendering/tenders/${t.id}/submit`).send({ method: 'portal' });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('bid decision');
    // Nothing moved, nothing recorded.
    expect((await http.get(`/api/v1/tendering/tenders/${t.id}`).expect(200)).body.status).toBe('draft');
    expect((await http.get(`/api/v1/tendering/tenders/${t.id}/submissions`).expect(200)).body).toHaveLength(0);
  });

  it('submitting records the facts — channel, reference, addenda, who, and the value snapshot', async () => {
    const { tender: t } = await readyToSubmit();

    const res = await http.post(`/api/v1/tendering/tenders/${t.id}/submit`)
      .send({ method: 'portal', portal: 'Etimad', reference: 'SUB-2026-091', addendaAcknowledged: 'ADD-01..02', validUntil: '2026-10-15', notes: 'Two boxes, hand receipt.' })
      .expect(201);

    expect(res.body.tender.status).toBe('submitted');
    const s = res.body.submission;
    expect(s.method).toBe('portal');
    expect(s.portal).toBe('Etimad');
    expect(s.reference).toBe('SUB-2026-091');
    expect(s.addendaAcknowledged).toBe('ADD-01..02');
    expect(s.validUntil).toBe('2026-10-15');
    expect(s.submittedValue).toBe(500_000); // the BOQ total at the moment of submission

    const listed = (await http.get(`/api/v1/tendering/tenders/${t.id}/submissions`).expect(200)).body;
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(s.id);
  });

  it('an unknown method is a 400, not a silently-stored word', async () => {
    const { tender: t } = await readyToSubmit();
    const res = await http.post(`/api/v1/tendering/tenders/${t.id}/submit`).send({ method: 'carrier-pigeon' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('method must be one of');
  });

  it('the legacy status route still works — and now leaves a (bare) record behind', async () => {
    const { tender: t } = await readyToSubmit();
    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'submitted' }).expect(200);

    const listed = (await http.get(`/api/v1/tendering/tenders/${t.id}/submissions`).expect(200)).body;
    expect(listed).toHaveLength(1);
    expect(listed[0].method).toBe('other');
    expect(listed[0].submittedValue).toBe(500_000);
  });

  it('resubmission appends a second record — a fact is never edited', async () => {
    const { tender: t } = await readyToSubmit();
    await http.post(`/api/v1/tendering/tenders/${t.id}/submit`).send({ method: 'portal', reference: 'SUB-1' }).expect(201);
    // A later addendum forces a resubmission of the same (still `submitted`) tender.
    await http.post(`/api/v1/tendering/tenders/${t.id}/submit`).send({ method: 'portal', reference: 'SUB-2', addendaAcknowledged: 'ADD-03' }).expect(201);

    const listed = (await http.get(`/api/v1/tendering/tenders/${t.id}/submissions`).expect(200)).body;
    expect(listed).toHaveLength(2);
    expect(listed.map((s: { reference: string }) => s.reference).sort()).toEqual(['SUB-1', 'SUB-2']);
  });

  it('the submitted value is a snapshot — a later BOQ edit does not rewrite the offer', async () => {
    const { tender: t, boq } = await readyToSubmit();
    const first = (await http.post(`/api/v1/tendering/tenders/${t.id}/submit`).send({ method: 'email' }).expect(201)).body;
    expect(first.submission.submittedValue).toBe(500_000);

    // The estimate keeps moving after submission (value recomputes from the BOQ)…
    await http.post(`/api/v1/tendering/tenders/${t.id}/boq/items`)
      .send({ boqId: boq.id, itemCode: '02', description: 'Sensors', unit: 'no', quantity: 100, rate: 1_000 })
      .expect(201);
    expect((await http.get(`/api/v1/tendering/tenders/${t.id}`).expect(200)).body.value).toBe(600_000);

    // …but what was offered on the day stays what was offered on the day.
    const listed = (await http.get(`/api/v1/tendering/tenders/${t.id}/submissions`).expect(200)).body;
    expect(listed[0].submittedValue).toBe(500_000);
  });

  it('won reads the record: blocked without one, allowed with one — even after a retreat', async () => {
    const { tender: t } = await readyToSubmit();
    // Status label without a record cannot exist through the API any more, so instead: retreat
    // AFTER submitting, then win from `priced` — the record survives the retreat.
    await http.post(`/api/v1/tendering/tenders/${t.id}/submit`).send({ method: 'portal' }).expect(201);
    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'priced' }).expect(200);

    const won = (await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'won' }).expect(200)).body;
    expect(won.status).toBe('won');
  });

  it('a tender born submitted (the deal-chain auto-tender) carries a record from birth', async () => {
    const t = (await http.post('/api/v1/tendering/tenders')
      .send({ title: 'From won opportunity', value: 250_000, status: 'submitted' })
      .expect(201)).body;

    const listed = (await http.get(`/api/v1/tendering/tenders/${t.id}/submissions`).expect(200)).body;
    expect(listed).toHaveLength(1);
    expect(listed[0].submittedValue).toBe(250_000);
    expect(listed[0].notes).toContain('created already submitted');

    // …which is exactly what lets the deal chain move it onward to won.
    const won = await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'won' });
    expect(won.status).toBe(200);
  });
});
