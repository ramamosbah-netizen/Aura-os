// AURA OS — G6 account party types + relationship graph, e2e (HTTP).
//
// An account's `status` said what the relationship is WORTH; nothing said what the party IS.
// This spec proves the two new facts end-to-end: partyType survives create/patch with unknown
// values refused, and typed directed edges read correctly from BOTH sides — the consultant sees
// "influences → Emaar", Emaar sees "influenced by ← Alpha" — with duplicates and self-links refused.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('G6 account party types + relationship graph (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'g6-tenant', companyId: null, actorId: null, correlationId: 'e2e-g6' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const account = async (name: string, partyType?: string): Promise<{ id: string; name: string }> =>
    (await http.post('/api/v1/crm/accounts').send({ name, ...(partyType ? { partyType } : {}) }).expect(201)).body;

  it('partyType: null until classified, settable on create and patch, unknown values refused', async () => {
    const plain = await account('Unclassified LLC');
    expect((await http.get(`/api/v1/crm/accounts/${plain.id}`).expect(200)).body.partyType).toBeNull();

    const typed = await account('Alpha Consultants', 'consultant');
    expect((await http.get(`/api/v1/crm/accounts/${typed.id}`).expect(200)).body.partyType).toBe('consultant');

    const patched = await http.patch(`/api/v1/crm/accounts/${plain.id}`).send({ partyType: 'developer' }).expect(200);
    expect(patched.body.partyType).toBe('developer');

    await http.post('/api/v1/crm/accounts').send({ name: 'Bad', partyType: 'wizard' }).expect(400);
    await http.patch(`/api/v1/crm/accounts/${plain.id}`).send({ partyType: 'wizard' }).expect(400);
  });

  it('a directed edge reads correctly from both sides, and appears in the portfolio', async () => {
    const consultant = await account('Beta Design Bureau', 'consultant');
    const developer = await account('Marina Developments', 'developer');

    const rel = (
      await http
        .post(`/api/v1/crm/accounts/${consultant.id}/relationships`)
        .send({ toAccountId: developer.id, type: 'influences', notes: 'specified us on Marina Hotel' })
        .expect(201)
    ).body;
    expect(rel.type).toBe('influences');

    const fromSide = (await http.get(`/api/v1/crm/accounts/${consultant.id}/relationships`).expect(200)).body;
    expect(fromSide.edges).toHaveLength(1);
    expect(fromSide.edges[0].direction).toBe('outbound');
    expect(fromSide.edges[0].reading).toBe('influences');
    expect(fromSide.edges[0].account.name).toBe('Marina Developments');
    expect(fromSide.edges[0].notes).toBe('specified us on Marina Hotel');

    const toSide = (await http.get(`/api/v1/crm/accounts/${developer.id}/relationships`).expect(200)).body;
    expect(toSide.edges[0].direction).toBe('inbound');
    expect(toSide.edges[0].reading).toBe('influenced by');
    expect(toSide.edges[0].account.partyType).toBe('consultant');

    const portfolio = (await http.get('/api/v1/crm/accounts/portfolio').expect(200)).body as Array<{ id: string; partyType: string | null }>;
    expect(portfolio.find((r) => r.id === consultant.id)?.partyType).toBe('consultant');
  });

  it('refuses a duplicate edge, a self-link, an unknown type, and a missing party', async () => {
    const a = await account('Gamma Contracting', 'main_contractor');
    const b = await account('Delta Properties', 'developer');
    await http.post(`/api/v1/crm/accounts/${a.id}/relationships`).send({ toAccountId: b.id, type: 'main_contractor_for' }).expect(201);

    await http.post(`/api/v1/crm/accounts/${a.id}/relationships`).send({ toAccountId: b.id, type: 'main_contractor_for' }).expect(400);
    await http.post(`/api/v1/crm/accounts/${a.id}/relationships`).send({ toAccountId: a.id, type: 'influences' }).expect(400);
    await http.post(`/api/v1/crm/accounts/${a.id}/relationships`).send({ toAccountId: b.id, type: 'is_friends_with' }).expect(400);
    await http
      .post(`/api/v1/crm/accounts/${a.id}/relationships`)
      .send({ toAccountId: '00000000-0000-4000-8000-000000000000', type: 'influences' })
      .expect(404);
  });

  it('unlink removes the edge from both sides; a second delete 404s', async () => {
    const a = await account('Epsilon Systems', 'subcontractor');
    const b = await account('Zeta Builders', 'main_contractor');
    const rel = (
      await http.post(`/api/v1/crm/accounts/${a.id}/relationships`).send({ toAccountId: b.id, type: 'subcontractor_of' }).expect(201)
    ).body;

    await http.delete(`/api/v1/crm/accounts/${a.id}/relationships/${rel.id}`).expect(200);
    expect((await http.get(`/api/v1/crm/accounts/${a.id}/relationships`).expect(200)).body.edges).toHaveLength(0);
    expect((await http.get(`/api/v1/crm/accounts/${b.id}/relationships`).expect(200)).body.edges).toHaveLength(0);
    await http.delete(`/api/v1/crm/accounts/${a.id}/relationships/${rel.id}`).expect(404);
  });

  it('a lead naming the account as consultant surfaces as a mention (G4 text → G6 graph)', async () => {
    const consultant = await account('Theta Engineering Consultants', 'consultant');
    await http
      .post('/api/v1/crm/leads')
      .send({ name: 'Site FM Manager', consultant: '  theta engineering consultants ', projectName: 'Tower B Fit-out' })
      .expect(201);

    const graph = (await http.get(`/api/v1/crm/accounts/${consultant.id}/relationships`).expect(200)).body;
    expect(graph.leadMentions).toHaveLength(1);
    expect(graph.leadMentions[0].role).toBe('consultant');
    expect(graph.leadMentions[0].projectName).toBe('Tower B Fit-out');
  });
});
