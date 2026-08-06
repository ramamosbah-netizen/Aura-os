// AURA OS — multi-invoice receipt allocation (cash application), over HTTP.
// One customer receipt clears several open invoices oldest-first; each slice posts Dr Bank / Cr AR.
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

const TENANT = 'ar-alloc-tenant';
const ACTOR = '00000000-0000-0000-0000-0000000000f1';
const TODAY = new Date().toISOString().slice(0, 10);

describe('AR receipt allocation (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter(), new AccessDeniedFilter());
    const access = app.get(AccessService);
    access.registerRole({ id: 'role-ar-alloc', name: 'AR Alloc Super', permissions: ['*'] });
    access.grant({ userId: ACTOR, roleId: 'role-ar-alloc', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) => {
      tenant.run({ tenantId: TENANT, companyId: null, actorId: ACTOR, correlationId: 'e2e-ar-alloc' }, () => next());
    });
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => { await app?.close(); });

  const issued = async (invoiceNumber: string, net: number) => {
    const created = (
      await http.post('/api/v1/finance/customer-invoices').send({
        invoiceNumber, customerName: 'Emaar', issueDate: TODAY,
        lines: [{ description: 'works', quantity: 1, unitPrice: net, vatRate: 5 }],
      }).expect(201)
    ).body;
    await http.post(`/api/v1/finance/customer-invoices/${created.id}/issue`).expect(201);
    return created;
  };
  const get = async (id: string) => (await http.get(`/api/v1/finance/customer-invoices/${id}`).expect(200)).body;

  it('applies one receipt across two invoices oldest-first', async () => {
    const a = await issued('AR-AL-1', 1_000); // 1,050 gross
    const b = await issued('AR-AL-2', 1_000); // 1,050 gross

    const res = (
      await http.post('/api/v1/finance/customer-invoices/allocate-receipt')
        .send({ customerName: 'Emaar', amount: 1_400 }).expect(201)
    ).body;

    expect(res.allocations).toHaveLength(2);
    expect(res.unapplied).toBe(0);
    expect((await get(a.id)).status).toBe('paid');
    const bAfter = await get(b.id);
    expect(bAfter.status).toBe('partially_paid');
    expect(bAfter.amountPaid).toBeCloseTo(350, 2);
  });

  it('reports an over-payment as unapplied', async () => {
    await issued('AR-AL-3', 500); // 525 gross
    const res = (
      await http.post('/api/v1/finance/customer-invoices/allocate-receipt')
        .send({ customerName: 'Emaar', amount: 2_000 }).expect(201)
    ).body;
    // AR-AL-2 still had 700 open + AR-AL-3 525 = 1,225 applied, 775 unapplied.
    expect(res.unapplied).toBeCloseTo(775, 2);
  });

  it('previews an allocation without writing', async () => {
    const inv = await issued('AR-AL-4', 300); // 315 gross
    const preview = (
      await http.get(`/api/v1/finance/customer-invoices/allocation-preview?customerName=Emaar&amount=100`).expect(200)
    ).body;
    expect(preview.totalAllocated).toBe(100);
    expect((await get(inv.id)).amountPaid).toBe(0);
  });

  it('rejects an over-allocation to a single invoice (409)', async () => {
    const inv = await issued('AR-AL-5', 200); // balance 210
    await http.post('/api/v1/finance/customer-invoices/allocate-receipt')
      .send({ customerName: 'Emaar', amount: 500, allocations: [{ invoiceId: inv.id, amount: 400 }] })
      .expect(409);
  });
});
