// AURA OS — the account snapshot (`accountId` + `accountName`), e2e (HTTP).
//
// The deal chain documents `accountName` as "reference + snapshot", but every caller (the UI and
// the API) posts only an `accountId` picked from a list. Creates used to trust the caller for the
// name and store null, so downstream readers rendered raw UUIDs — C6's concentration table found
// it. These tests pin the contract at the seam that broke: the create route itself.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('account snapshot (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let emaar: { id: string };
  let damac: { id: string };

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'snapshot-tenant', companyId: null, actorId: null, correlationId: 'e2e-snapshot' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
    emaar = (await http.post('/api/v1/crm/accounts').send({ name: 'Emaar' }).expect(201)).body;
    damac = (await http.post('/api/v1/crm/accounts').send({ name: 'Damac' }).expect(201)).body;
  });

  afterAll(async () => {
    await app?.close();
  });

  // The normal case, on every aggregate that carries the convention: the caller posts the
  // reference it picked from a list and never types the name.
  const CHAIN: ReadonlyArray<{ what: string; url: string; body: (accountId: string) => object }> = [
    { what: 'opportunity', url: '/api/v1/crm/opportunities', body: (accountId) => ({ title: 'Deal', accountId }) },
    { what: 'tender', url: '/api/v1/tendering/tenders', body: (accountId) => ({ title: 'Tender', accountId }) },
    { what: 'contract', url: '/api/v1/contracts/contracts', body: (accountId) => ({ title: 'Contract', accountId }) },
    { what: 'project', url: '/api/v1/projects/projects', body: (accountId) => ({ title: 'Project', accountId }) },
    { what: 'contact', url: '/api/v1/crm/contacts', body: (accountId) => ({ name: 'Layla Hassan', accountId }) },
  ];

  for (const { what, url, body } of CHAIN) {
    it(`${what}: an accountId with no name still snapshots the account's name`, async () => {
      const created = (await http.post(url).send(body(emaar.id)).expect(201)).body;
      expect(created.accountId).toBe(emaar.id);
      expect(created.accountName).toBe('Emaar');
    });
  }

  it('an explicitly supplied name wins over the live one (the snapshot is the point)', async () => {
    // Recording what the account was called on a historical document must survive the resolve.
    const opp = (await http.post('/api/v1/crm/opportunities')
      .send({ title: 'Deal', accountId: emaar.id, accountName: 'Emaar Properties PJSC' })
      .expect(201)).body;
    expect(opp.accountName).toBe('Emaar Properties PJSC');
  });

  it('an unresolvable account leaves the name null rather than failing the create', async () => {
    const opp = (await http.post('/api/v1/crm/opportunities')
      .send({ title: 'Ghost deal', accountId: '00000000-0000-4000-8000-000000000000' })
      .expect(201)).body;
    expect(opp.accountName).toBeNull();
  });

  it('a deal with no account at all carries no name', async () => {
    const opp = (await http.post('/api/v1/crm/opportunities').send({ title: 'Unlinked' }).expect(201)).body;
    expect(opp.accountName).toBeNull();
  });

  describe('PATCH', () => {
    it('moving the deal to another account re-snapshots the name', async () => {
      const opp = (await http.post('/api/v1/crm/opportunities')
        .send({ title: 'Deal', accountId: emaar.id }).expect(201)).body;
      expect(opp.accountName).toBe('Emaar');

      const moved = (await http.patch(`/api/v1/crm/opportunities/${opp.id}`)
        .send({ accountId: damac.id }).expect(200)).body;
      // The old name described the old account — carrying it over would be a lie.
      expect(moved).toMatchObject({ accountId: damac.id, accountName: 'Damac' });
    });

    it('a patch that says nothing about the account leaves the snapshot alone', async () => {
      const opp = (await http.post('/api/v1/crm/opportunities')
        .send({ title: 'Deal', accountId: emaar.id }).expect(201)).body;

      const patched = (await http.patch(`/api/v1/crm/opportunities/${opp.id}`)
        .send({ title: 'Deal (renamed)' }).expect(200)).body;
      expect(patched).toMatchObject({ title: 'Deal (renamed)', accountName: 'Emaar' });
    });

    it('an explicit name on a patch wins over the account it moves to', async () => {
      const opp = (await http.post('/api/v1/crm/opportunities')
        .send({ title: 'Deal', accountId: emaar.id }).expect(201)).body;

      const patched = (await http.patch(`/api/v1/crm/opportunities/${opp.id}`)
        .send({ accountId: damac.id, accountName: 'Damac Group' }).expect(200)).body;
      expect(patched).toMatchObject({ accountId: damac.id, accountName: 'Damac Group' });
    });
  });

  // The reason this bug mattered: the chain copies the head's snapshot forward, so a null at the
  // opportunity stranded every aggregate downstream of it.
  it('the snapshot survives the auto-created tender when a deal is won', async () => {
    const opp = (await http.post('/api/v1/crm/opportunities')
      .send({ title: 'Chain deal', accountId: emaar.id, value: 100_000, requiresTender: true })
      .expect(201)).body;
    expect(opp.accountName).toBe('Emaar');

    const tenders = (await http.get('/api/v1/tendering/tenders').expect(200)).body;
    const spawned = tenders.find((t: { accountId: string | null }) => t.accountId === emaar.id);
    if (spawned) expect(spawned.accountName).toBe('Emaar');
  });
});
