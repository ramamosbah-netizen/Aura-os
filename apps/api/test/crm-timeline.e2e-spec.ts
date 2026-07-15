// AURA OS — Unified Timeline e2e (HTTP). One record's domain events (created,
// stage change) MERGE with the activities logged against it, newest-first.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

interface TimelineEntry { id: string; at: string; kind: 'event' | 'activity'; title: string; }

describe('Unified Timeline e2e (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'tl-tenant', companyId: null, actorId: null, correlationId: 'e2e-tl' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('merges the opportunity’s events and its activities into one feed', async () => {
    // G5: entering `proposal` needs a confirmed need and someone to propose TO, so this deal is
    // set up the way a real one would be — an account with a named contact.
    const account = (await http.post('/api/v1/crm/accounts').send({ name: 'Skyline Developments' }).expect(201)).body;
    await http.post('/api/v1/crm/contacts').send({ name: 'Nadia Aziz', accountId: account.id }).expect(201);
    const opp = (
      await http
        .post('/api/v1/crm/opportunities')
        .send({ title: 'Skyline ELV', value: 400_000, accountId: account.id, accountName: account.name, needConfirmed: true })
        .expect(201)
    ).body;
    // A stage change → emits a domain event on the aggregate.
    await http.patch(`/api/v1/crm/opportunities/${opp.id}`).send({ stage: 'proposal' }).expect(200);
    // An activity logged against the same record.
    await http
      .post('/api/v1/crm/activities')
      .send({ type: 'call', subject: 'Kickoff call', relatedType: 'opportunity', relatedId: opp.id })
      .expect(201);

    const feed = (await http.get(`/api/v1/crm/timeline?id=${opp.id}`).expect(200)).body as TimelineEntry[];

    expect(feed.length).toBeGreaterThanOrEqual(2);
    expect(feed.some((e) => e.kind === 'event')).toBe(true);
    expect(feed.some((e) => e.kind === 'activity' && e.title.includes('Kickoff call'))).toBe(true);
    // Newest-first ordering.
    for (let i = 1; i < feed.length; i++) expect(feed[i - 1].at >= feed[i].at).toBe(true);
  });

  it('an unknown record id yields an empty feed (no crash)', async () => {
    const feed = (await http.get('/api/v1/crm/timeline?id=does-not-exist').expect(200)).body;
    expect(feed).toEqual([]);
  });
});
