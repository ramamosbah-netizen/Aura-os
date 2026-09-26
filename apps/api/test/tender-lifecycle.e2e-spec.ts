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
import { approveTenderOffer, governTenderBasis, grantTenderTeam } from './governed-tender.fixture';

describe('T1 tender lifecycle & gates (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    grantTenderTeam(app, 't1-tenant');
    // ADR-0021 needs a REAL identity to capture award evidence (no 'system' fallback), but
    // switching the actor on globally would turn AccessService on for every other call in these
    // specs. So the actor is per-request, via a header only the award helper sends.
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 't1-tenant', companyId: null, actorId: (_req as { headers?: Record<string, string> }).headers?.['x-e2e-actor'] ?? null, correlationId: 'e2e-t1' }, () => next()),
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

  /**
   * ADR-0021 — the ONLY governed path to `won`. A tender win is a customer award, so it carries the
   * customer's award evidence (value excl. VAT, currency, award date). `PATCH /status {won}` is
   * refused by design; these specs go through the award command exactly as the product does.
   */
  const award = (id: string, over: Record<string, unknown> = {}) =>
    http.post(`/api/v1/tendering/tenders/${id}/award`).set('x-e2e-actor', 'u-e2e-bid-manager').send({
      awardedValue: 1_000_000, currency: 'AED', awardedAt: '2026-08-21T07:30:00.000Z', awardReference: 'LOA-E2E', ...over,
    });


  // Record a bid decision whose weighted score lands on the target recommendation.
  const scoreBid = (tenderId: string, score: number) =>
    http.post('/api/v1/tendering/bid-scores')
      .send({ tenderId, criteria: [{ name: 'fit', weight: 1, score }] })
      .expect(201);

  it('registers one immutable qualification and rejects direct API reassessment', async () => {
    const tender = await newTender();
    const original = (await scoreBid(tender.id, 8)).body;
    const replacement = await http.post('/api/v1/tendering/bid-scores')
      .send({ tenderId: tender.id, criteria: [{ name: 'fit', weight: 1, score: 1 }] });
    expect(replacement.status).toBe(409);
    expect(replacement.body.message).toContain('already confirmed');
    const records = (await http.get(`/api/v1/tendering/bid-scores?tenderId=${tender.id}`).expect(200)).body;
    expect(records).toEqual([original]);
    expect(records[0].recommendation).toBe('go');
  });

  it('stores tender study attachments and written requirements in DMS against the canonical tender', async () => {
    const tender = await newTender();
    const binary = Buffer.from('%PDF-1.7\nTender drawing\n\x00\xff', 'binary');
    const uploaded = (await http.post(`/api/v1/tendering/tenders/${tender.id}/study-files`)
      .field('category', 'drawing').field('title', 'Client drawing A')
      .field('aggregateId', 'spoofed-tender')
      .attach('file', binary, { filename: 'drawing.pdf', contentType: 'application/pdf' }).expect(201)).body;
    expect(uploaded.document.aggregateId).toBe(tender.id);
    expect(uploaded.versions[0].sizeBytes).toBe(binary.length);
    const downloaded = await http.get(`/api/v1/documents/${uploaded.document.id}/content`).expect(200);
    expect(downloaded.body).toEqual(binary);
    const note = (await http.post(`/api/v1/tendering/tenders/${tender.id}/study-files`)
      .field('category', 'government_requirement').field('title', 'Authority review')
      .field('notes', 'Identify jurisdiction and applicable approval requirements.').expect(201)).body;
    expect(note.document.kind).toBe('government_requirement');
    const files = (await http.get(`/api/v1/tendering/tenders/${tender.id}/study-files`).expect(200)).body;
    expect(files.map((file: { id: string }) => file.id).sort()).toEqual([uploaded.document.id, note.document.id].sort());
    const other = await newTender();
    expect((await http.get(`/api/v1/tendering/tenders/${other.id}/study-files`).expect(200)).body).toEqual([]);
    await http.post(`/api/v1/tendering/tenders/${other.id}/study-files`).field('category', 'drawing').field('title', 'Missing file').expect(400);
    await http.post('/api/v1/tendering/tenders/00000000-0000-4000-8000-000000000000/study-files')
      .field('category', 'study_note').field('title', 'Orphan').field('notes', 'must not save').expect(404);
  });

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

    // ADR-0021 made this stricter, not looser: `won` is no longer a status you may set AT ALL, so
    // the refusal now names the governed command instead of the submission gate.
    const toWon = await setStatus(t.id, 'won');
    expect(toWon.status).toBe(409);
    expect(toWon.body.message).toContain('can only be won through the governed award command');

    // …and the gate itself was NOT weakened: the governed path still refuses an unsubmitted bid,
    // so evidence buys a tender a hearing, never a shortcut past the lifecycle.
    const awarded = await award(t.id);
    expect(awarded.status).toBe(409);
    expect(awarded.body.message).toContain('Only a submitted bid can be won');

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

    // Cannot claim priced until something is priced — on the governed basis: an approved study, an
    // approved take-off projected to the BOQ, and the item priced on the sheet.
    expect((await setStatus(t.id, 'priced')).status).toBe(409);
    await governTenderBasis(http, t.id, { description: 'Cameras', unit: 'no', quantity: 10 });
    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'priced' }).expect(200);

    // Submission needs the internally approved offer (assertSubmissionReadiness).
    await approveTenderOffer(http, t.id);
    await http.patch(`/api/v1/tendering/tenders/${t.id}/status`).send({ status: 'submitted' }).expect(200);
    const estimate = (await http.get(`/api/v1/tendering/tenders/${t.id}`).expect(200)).body.value as number;
    const won = (await award(t.id).expect(201)).body;
    expect(won.status).toBe('won');
    // The award is EVIDENCED — the customer's number, not our estimate.
    expect(won.awardEvidence.awardedValue).toBe(1_000_000);
    expect(won.awardEvidence.currency).toBe('AED');
    // The estimate is untouched by the award: still the priced BOQ's value, not the customer's number.
    expect(estimate).toBeGreaterThan(0);
    expect(won.value).toBe(estimate);
    expect(won.value).not.toBe(1_000_000);
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
