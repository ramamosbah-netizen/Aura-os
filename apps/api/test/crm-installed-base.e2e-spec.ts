// AURA OS — C3 Installed Base & White-Space (§26), e2e (HTTP).
//
// The full loop over the wire: record what the customer HAS → the coverage board and findings
// derive per read → the scan raises findings as SIGNALS on the S3 radar (deduplicated — a
// re-scan raises nothing new until the facts change). §26's law: signals, never auto-created
// opportunities.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('C3 installed base & white-space (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'c3-tenant', companyId: null, actorId: null, correlationId: 'e2e-c3' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const inDays = (n: number): string => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  it('records the base, derives coverage + findings, and the scan raises deduplicated signals', async () => {
    const account = (await http.post('/api/v1/crm/accounts').send({ name: 'Marina Towers FM', partyType: 'end_client' }).expect(201)).body;

    // Empty register → no findings (not surveyed ≠ everything missing).
    const empty = (await http.get(`/api/v1/crm/accounts/${account.id}/installed-base`).expect(200)).body;
    expect(empty.findings).toEqual([]);

    // Our CCTV with no AMC; competitor access control; unknown type refused.
    await http.post(`/api/v1/crm/accounts/${account.id}/installed-base`)
      .send({ system: 'cctv', provider: 'us', amcStatus: 'none', warrantyExpiresAt: inDays(30) }).expect(201);
    await http.post(`/api/v1/crm/accounts/${account.id}/installed-base`)
      .send({ system: 'access_control', provider: 'competitor', competitorName: 'RivalCo' }).expect(201);
    await http.post(`/api/v1/crm/accounts/${account.id}/installed-base`).send({ system: 'teleporter' }).expect(400);

    const view = (await http.get(`/api/v1/crm/accounts/${account.id}/installed-base`).expect(200)).body;
    expect(view.items).toHaveLength(2);
    const cov = Object.fromEntries(view.coverage.map((c: { system: string; status: string }) => [c.system, c.status]));
    expect(cov.cctv).toBe('ours');
    expect(cov.access_control).toBe('competitor');
    expect(cov.fire_alarm).toBe('missing');
    const kinds = view.findings.map((f: { kind: string }) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(['AMC_CROSS_SELL', 'REPLACEMENT', 'WARRANTY_EXPIRING', 'WHITE_SPACE']));

    // First scan raises signals; the SAME scan again raises zero new (dedupeKey idempotency).
    const first = (await http.post(`/api/v1/crm/accounts/${account.id}/installed-base/scan`).expect(201)).body;
    expect(first.raised).toBe(first.findings.length);
    expect(first.raised).toBeGreaterThanOrEqual(4);

    const second = (await http.post(`/api/v1/crm/accounts/${account.id}/installed-base/scan`).expect(201)).body;
    expect(second.raised).toBe(0);
    expect(second.findings.length).toBe(first.findings.length);

    // The signals are real, on the radar, account-attributed, ACCOUNT_GROWTH-sourced.
    const signals = (await http.get('/api/v1/crm/signals').expect(200)).body as Array<{ accountId: string; source: string; type: string }>;
    const mine = signals.filter((s) => s.accountId === account.id);
    expect(mine.length).toBe(first.raised);
    expect(mine.every((s) => s.source === 'ACCOUNT_GROWTH')).toBe(true);
    expect(mine.map((s) => s.type)).toEqual(expect.arrayContaining(['AMC_EXPIRY', 'UPSELL', 'WARRANTY_EXPIRY', 'CROSS_SELL']));
  });

  it('edit and remove round-trip; a removed item stops generating its finding', async () => {
    const account = (await http.post('/api/v1/crm/accounts').send({ name: 'Delta FM' }).expect(201)).body;
    const it1 = (await http.post(`/api/v1/crm/accounts/${account.id}/installed-base`)
      .send({ system: 'bms', provider: 'competitor', competitorName: 'OldCo' }).expect(201)).body;

    const patched = (await http.patch(`/api/v1/crm/accounts/${account.id}/installed-base/${it1.id}`)
      .send({ provider: 'us', amcStatus: 'ours', amcExpiresAt: inDays(30) }).expect(200)).body;
    expect(patched.provider).toBe('us');

    await http.delete(`/api/v1/crm/accounts/${account.id}/installed-base/${it1.id}`).expect(200);
    const after = (await http.get(`/api/v1/crm/accounts/${account.id}/installed-base`).expect(200)).body;
    expect(after.items).toHaveLength(0);
    expect(after.findings).toEqual([]);
  });
});
