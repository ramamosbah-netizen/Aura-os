// AURA OS — Compliance Core over HTTP (G-20 / ADR-0018).
//
// Exercises the whole journey on ONE surface for any authority: register an authority, open a
// case, submit, be rejected, resubmit, be inspected, be approved, get certified, renew.
//
// The assertions that carry the design are the history ones — that a rejection survives the later
// approval, and that a renewal issues a new certificate rather than editing an expiry date. Those
// are the two places where a simpler model quietly loses the record a dispute turns on.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const PROJECT = '11111111-1111-1111-1111-111111111111';

describe('Compliance Core (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('ships with NO authorities — the core has zero seeded rules by decision', async () => {
    // An un-sourced regulatory fact looks authoritative and gets relied on by someone deciding
    // whether a system may legally operate. So nothing is shipped until it is sourced.
    const res = await http.get('/api/v1/compliance/authorities').expect(200);
    expect(res.body).toEqual([]);
  });

  it('refuses to open a case naming an authority nobody registered', async () => {
    const res = await http.post('/api/v1/compliance/cases').send({
      authorityCode: 'SIRA', obligationCode: 'SYSTEM_CERT', scope: 'PROJECT', subjectId: PROJECT, system: 'cctv',
    });
    expect(res.status).toBe(404);
  });

  it('registers authorities by hand, normalising code and jurisdiction', async () => {
    const sira = await http.post('/api/v1/compliance/authorities')
      .send({ code: ' sira ', name: 'Security Industry Regulatory Agency', jurisdiction: 'ae-du' });
    expect(sira.status).toBeLessThan(300);
    expect(sira.body.code).toBe('SIRA');
    expect(sira.body.jurisdiction).toBe('AE-DU');

    await http.post('/api/v1/compliance/authorities')
      .send({ code: 'DCD', name: 'Dubai Civil Defence', jurisdiction: 'AE-DU' })
      .expect((r) => expect(r.status).toBeLessThan(300));

    // Adding a second authority took no code change — the acceptance test ADR-0018 sets.
    const list = await http.get('/api/v1/compliance/authorities').expect(200);
    expect((list.body as Array<{ code: string }>).map((a) => a.code)).toEqual(['DCD', 'SIRA']);
  });

  it('refuses a duplicate authority code', async () => {
    const res = await http.post('/api/v1/compliance/authorities')
      .send({ code: 'sira', name: 'Duplicate', jurisdiction: 'AE-DU' });
    expect(res.status).toBe(409);
  });

  describe('a case through rejection, resubmission and certification', () => {
    let caseId: string;

    it('opens a project-scoped case and derives its subject type', async () => {
      const res = await http.post('/api/v1/compliance/cases').send({
        authorityCode: 'SIRA', obligationCode: 'SYSTEM_CERT', scope: 'PROJECT',
        subjectId: PROJECT, projectId: PROJECT, system: 'cctv',
      });
      expect(res.status).toBeLessThan(300);
      caseId = res.body.id;
      expect(res.body.subjectType).toBe('project');
      expect(res.body.coverage).toBe('ALL_SYSTEM_DEVICES');
      expect(res.body.status).toBe('draft');
    });

    it('submits, and the case follows', async () => {
      const res = await http.post(`/api/v1/compliance/cases/${caseId}/submissions`)
        .send({ submittedAt: '2026-08-01', reference: 'SIRA-SUB-1', fee: 500, currency: 'aed' });
      expect(res.status).toBeLessThan(300);
      expect(res.body.attempt).toBe(1);
      expect(res.body.currency).toBe('AED');

      const c = await http.get(`/api/v1/compliance/cases/${caseId}`).expect(200);
      expect(c.body.status).toBe('submitted');
    });

    it('refuses a rejection with no reason — a refusal you cannot act on is not a decision', async () => {
      const res = await http.post(`/api/v1/compliance/cases/${caseId}/decisions`)
        .send({ outcome: 'rejected', decisionDate: '2026-08-10' });
      expect(res.status).toBe(400);
    });

    it('records the rejection with its reason', async () => {
      const res = await http.post(`/api/v1/compliance/cases/${caseId}/decisions`)
        .send({ outcome: 'rejected', decisionDate: '2026-08-10', reason: 'as-built drawings missing', decisionBy: 'SIRA officer' });
      expect(res.status).toBeLessThan(300);

      const c = await http.get(`/api/v1/compliance/cases/${caseId}`).expect(200);
      expect(c.body.status).toBe('rejected');
    });

    it('resubmits as attempt 2 rather than overwriting attempt 1', async () => {
      const res = await http.post(`/api/v1/compliance/cases/${caseId}/submissions`)
        .send({ submittedAt: '2026-09-01', reference: 'SIRA-SUB-2' });
      expect(res.body.attempt).toBe(2);

      const subs = await http.get(`/api/v1/compliance/cases/${caseId}/submissions`).expect(200);
      expect((subs.body as Array<{ attempt: number }>).map((s) => s.attempt)).toEqual([1, 2]);
    });

    it('schedules an inspection and records a passing visit', async () => {
      const created = await http.post(`/api/v1/compliance/cases/${caseId}/inspections`)
        .send({ scheduledAt: '2026-09-10' });
      expect(created.status).toBeLessThan(300);

      const done = await http.put(`/api/v1/compliance/inspections/${created.body.id}/outcome`)
        .send({ outcome: 'pass', conductedAt: '2026-09-10', inspectionReference: 'INSP-77' });
      expect(done.body.outcome).toBe('pass');
      expect(done.body.reinspectionRequired).toBe(false);
    });

    it('approves — and the earlier rejection is still there', async () => {
      await http.post(`/api/v1/compliance/cases/${caseId}/decisions`)
        .send({ outcome: 'approved', decisionDate: '2026-09-20' })
        .expect((r) => expect(r.status).toBeLessThan(300));

      const history = await http.get(`/api/v1/compliance/cases/${caseId}/decisions`).expect(200);
      const rows = history.body as Array<{ outcome: string; reason: string | null }>;

      // The whole reason decisions are their own append-only entity: a status field on the case
      // would have erased the refusal the moment approval arrived.
      expect(rows).toHaveLength(2);
      expect(rows[0].outcome).toBe('rejected');
      expect(rows[0].reason).toBe('as-built drawings missing');
      expect(rows[1].outcome).toBe('approved');
    });

    it('issues a certificate and marks the case certified', async () => {
      const res = await http.post(`/api/v1/compliance/cases/${caseId}/certificates`)
        .send({ number: 'SIRA-CERT-001', issuedAt: '2026-09-25', expiresAt: '2027-09-25' });
      expect(res.status).toBeLessThan(300);
      expect(res.body.supersededByCertificateId).toBeNull();

      const c = await http.get(`/api/v1/compliance/cases/${caseId}`).expect(200);
      expect(c.body.status).toBe('certified');
    });

    it('renews by issuing a NEW certificate, leaving the old dates intact', async () => {
      await http.post(`/api/v1/compliance/cases/${caseId}/certificates`)
        .send({ number: 'SIRA-CERT-002', issuedAt: '2027-09-25', expiresAt: '2028-09-25' })
        .expect((r) => expect(r.status).toBeLessThan(300));

      const series = await http.get(`/api/v1/compliance/cases/${caseId}/certificates`).expect(200);
      const rows = series.body as Array<{ number: string; expiresAt: string; supersededByCertificateId: string | null }>;

      expect(rows).toHaveLength(2);
      // "What was valid on 14 March" stays answerable because the first row was never edited.
      expect(rows[0].number).toBe('SIRA-CERT-001');
      expect(rows[0].expiresAt).toBe('2027-09-25');
      expect(rows[0].supersededByCertificateId).not.toBeNull();
      expect(rows[1].supersededByCertificateId).toBeNull();
    });

    it('writes the renewal in an order the foreign key accepts', async () => {
      // Regression pin for a Postgres-only defect the in-memory suite passed straight through:
      // the superseded row points at the new certificate, so the NEW one has to be written first
      // or the FK rejects it. Found by a live probe, not by this suite — which is the argument
      // for probing the real adapter rather than trusting the fake one.
      const series = await http.get(`/api/v1/compliance/cases/${caseId}/certificates`).expect(200);
      const rows = series.body as Array<{ id: string; number: string; supersededByCertificateId: string | null }>;
      const superseded = rows.find((r) => r.supersededByCertificateId);
      expect(superseded, 'the renewal must have superseded the original').toBeTruthy();
      // The row it points at must actually exist in the series.
      expect(rows.some((r) => r.id === superseded!.supersededByCertificateId)).toBe(true);
    });

    it('refuses a certificate that expires before it is issued', async () => {
      const res = await http.post(`/api/v1/compliance/cases/${caseId}/certificates`)
        .send({ number: 'BAD', issuedAt: '2027-01-01', expiresAt: '2026-01-01' });
      expect(res.status).toBe(400);
    });
  });

  describe('scope and coverage', () => {
    it('opens a COMPANY-scoped case — the licence SIRA issues to the contractor, not the project', async () => {
      const res = await http.post('/api/v1/compliance/cases').send({
        authorityCode: 'SIRA', obligationCode: 'COMPANY_LICENCE', scope: 'COMPANY', subjectId: 'company-1',
      });
      expect(res.status).toBeLessThan(300);
      expect(res.body.subjectType).toBe('company');
      expect(res.body.projectId).toBeNull();
    });

    it('opens a PERSON-scoped case — the technician card', async () => {
      const res = await http.post('/api/v1/compliance/cases').send({
        authorityCode: 'SIRA', obligationCode: 'TECHNICIAN_CARD', scope: 'PERSON', subjectId: 'user-9',
      });
      expect(res.body.subjectType).toBe('person');
    });

    it('refuses SELECTED_DEVICES coverage naming no devices', async () => {
      const res = await http.post('/api/v1/compliance/cases').send({
        authorityCode: 'DCD', obligationCode: 'FIRE_CERT', scope: 'PROJECT', subjectId: PROJECT,
        system: 'fire_alarm', coverage: 'SELECTED_DEVICES', deviceIds: [],
      });
      expect(res.status).toBe(400);
    });

    it('filters the register by authority and by scope', async () => {
      const sira = await http.get('/api/v1/compliance/cases?authorityCode=SIRA').expect(200);
      expect((sira.body as unknown[]).length).toBeGreaterThanOrEqual(3);

      const company = await http.get('/api/v1/compliance/cases?scope=COMPANY').expect(200);
      expect((company.body as Array<{ scope: string }>).every((c) => c.scope === 'COMPANY')).toBe(true);
    });
  });

  it('lists lapsed and lapsing certificates, keeping expired ones on the list', async () => {
    // Operating on an expired approval is the most urgent item here, not one that drops off.
    const res = await http.get('/api/v1/compliance/renewals?asOf=2029-01-01&withinDays=90').expect(200);
    const rows = res.body as Array<{ status: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.status === 'expired')).toBe(true);
  });
});
