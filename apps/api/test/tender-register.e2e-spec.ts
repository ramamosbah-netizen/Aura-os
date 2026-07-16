// AURA OS — T4 tender register depth (§2.2), e2e (HTTP).
//
// The register's two missing dimensions over the wire: SOURCE classification (invitation /
// public / private / opportunity — where the tender came from, orthogonal to status) and the
// clarification/addendum trail (the Q&A and change traffic between register and submission,
// including an addendum moving the submission deadline).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('T4 tender register depth (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 't4-tenant', companyId: null, actorId: null, correlationId: 'e2e-t4' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const newTender = async (body: Record<string, unknown> = {}) =>
    (await http.post('/api/v1/tendering/tenders').send({ title: 'Metro depot ELV', value: 100_000, ...body }).expect(201)).body;

  describe('source classification', () => {
    it('a tender carries its register source, and the list filters by it', async () => {
      const t = await newTender({ source: 'public', title: 'Public portal bid' });
      expect(t.source).toBe('public');

      const publics = (await http.get('/api/v1/tendering/tenders?source=public').expect(200)).body;
      expect(publics.some((x: { id: string }) => x.id === t.id)).toBe(true);
      const invitations = (await http.get('/api/v1/tendering/tenders?source=invitation').expect(200)).body;
      expect(invitations.some((x: { id: string }) => x.id === t.id)).toBe(false);
    });

    it('a tender born from an opportunity classifies itself as opportunity', async () => {
      const t = await newTender({ sourceOpportunityId: '4dc1b2e0-0000-4000-8000-000000000001' });
      expect(t.source).toBe('opportunity');
    });

    it('an unknown source is a 400; PATCH reclassifies', async () => {
      const bad = await http.post('/api/v1/tendering/tenders').send({ title: 'x', source: 'rumour' });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toContain('source must be one of');

      const t = await newTender();
      expect(t.source).toBeNull(); // unclassified, never guessed
      const patched = (await http.patch(`/api/v1/tendering/tenders/${t.id}`).send({ source: 'invitation' }).expect(200)).body;
      expect(patched.source).toBe('invitation');
    });
  });

  describe('clarifications & addenda', () => {
    it('records a clarification, lists it open, and answers it exactly once', async () => {
      const t = await newTender();
      const c = (await http.post(`/api/v1/tendering/tenders/${t.id}/clarifications`)
        .send({ title: 'Camera pole spec?', reference: 'RFI-01', body: 'Which spec applies to poles?', responseDue: '2026-08-01' })
        .expect(201)).body;
      expect(c.kind).toBe('clarification');
      expect(c.answeredAt).toBeNull();

      const open = (await http.get(`/api/v1/tendering/tenders/${t.id}/clarifications?open=true`).expect(200)).body;
      expect(open).toHaveLength(1);

      const answered = (await http.patch(`/api/v1/tendering/tenders/${t.id}/clarifications/${c.id}/answer`)
        .send({ answer: 'Spec B, per Annex 3.' }).expect(200)).body;
      expect(answered.answer).toBe('Spec B, per Annex 3.');

      // Answering twice is a state conflict, and the open filter is now empty.
      const again = await http.patch(`/api/v1/tendering/tenders/${t.id}/clarifications/${c.id}/answer`).send({ answer: 'x' });
      expect(again.status).toBe(409);
      expect((await http.get(`/api/v1/tendering/tenders/${t.id}/clarifications?open=true`).expect(200)).body).toHaveLength(0);
    });

    it('an addendum that grants an extension moves the tender submission deadline', async () => {
      const t = await newTender({ submissionDeadline: '2026-08-10' });
      await http.post(`/api/v1/tendering/tenders/${t.id}/clarifications`)
        .send({ kind: 'addendum', reference: 'ADD-02', title: 'Scope change — add access control', deadlineExtendedTo: '2026-09-01' })
        .expect(201);

      const after = (await http.get(`/api/v1/tendering/tenders/${t.id}`).expect(200)).body;
      expect(after.submissionDeadline).toBe('2026-09-01');
    });

    it('a plain clarification cannot move the deadline, and unknown kinds are refused', async () => {
      const t = await newTender({ submissionDeadline: '2026-08-10' });
      const res = await http.post(`/api/v1/tendering/tenders/${t.id}/clarifications`)
        .send({ title: 'Extension?', deadlineExtendedTo: '2026-09-01' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('addendum fact');

      const badKind = await http.post(`/api/v1/tendering/tenders/${t.id}/clarifications`).send({ title: 'x', kind: 'rumour' });
      expect(badKind.status).toBe(400);

      // The deadline never moved.
      expect((await http.get(`/api/v1/tendering/tenders/${t.id}`).expect(200)).body.submissionDeadline).toBe('2026-08-10');
    });
  });
});
