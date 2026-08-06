// AURA OS — customer refunds post Dr AR / Cr Bank on pay (HTTP).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { AccessDeniedFilter } from '../src/auth/access-denied.filter';

const TENANT = 'refund-tenant';
const ACTOR = '00000000-0000-0000-0000-00000000ab01';
const TODAY = new Date().toISOString().slice(0, 10);

describe('Customer refunds (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter(), new AccessDeniedFilter());
    const access = app.get(AccessService);
    access.registerRole({ id: 'role-refund', name: 'Refund Super', permissions: ['*'] });
    access.grant({ userId: ACTOR, roleId: 'role-refund', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) => {
      tenant.run({ tenantId: TENANT, companyId: null, actorId: ACTOR, correlationId: 'e2e-refund' }, () => next());
    });
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => { await app?.close(); });

  const draft = async (refundNumber: string, amount: number) =>
    (await http.post('/api/v1/finance/customer-refunds').send({ refundNumber, customerName: 'Acme', reason: 'over-payment', amount, refundDate: TODAY }).expect(201)).body;

  it('paying a refund posts Dr AR / Cr Bank to the GL', async () => {
    const r = await draft('RF-1', 5_000);
    await http.post(`/api/v1/finance/customer-refunds/${r.id}/pay`).expect(201);

    const journals = (await http.get('/api/v1/finance/journals?reference=REFUND-RF-1').expect(200)).body;
    expect(journals.length).toBe(1);
    const lines = journals[0].lines as Array<{ accountCode: string; debit: number; credit: number }>;
    const ar = lines.find((l) => l.accountCode === '1200');
    const bank = lines.find((l) => l.accountCode === '1010');
    expect(ar?.debit).toBeCloseTo(5_000, 2);
    expect(bank?.credit).toBeCloseTo(5_000, 2);
  });

  it('rejects a non-positive amount (400)', async () => {
    await http.post('/api/v1/finance/customer-refunds').send({ refundNumber: 'RF-X', customerName: 'Acme', amount: 0, refundDate: TODAY }).expect(400);
  });

  it('cannot pay a refund twice (409)', async () => {
    const r = await draft('RF-2', 1_000);
    await http.post(`/api/v1/finance/customer-refunds/${r.id}/pay`).expect(201);
    await http.post(`/api/v1/finance/customer-refunds/${r.id}/pay`).expect(409);
  });

  it('cannot cancel a paid refund (409)', async () => {
    const r = await draft('RF-3', 800);
    await http.post(`/api/v1/finance/customer-refunds/${r.id}/pay`).expect(201);
    await http.post(`/api/v1/finance/customer-refunds/${r.id}/cancel`).expect(409);
  });
});
