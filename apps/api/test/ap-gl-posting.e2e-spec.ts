// AURA OS — AP invoice approval books the payable to the GL (wave-3 finance audit), over HTTP.
// The AP payment reactor already posted Dr AP / Cr Bank, but nothing ever credited AP, so the
// payable was never booked and the supplier's expense never reached the P&L. Approval is the point
// the liability is recognised: Dr Supplier & Subcontract Costs / Cr Accounts Payable.
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

const TENANT = 'ap-gl-tenant';
const MAKER = '00000000-0000-0000-0000-0000000000e1';
const CHECKER = '00000000-0000-0000-0000-0000000000e2';
const YEAR = new Date().toISOString().slice(0, 4);

describe('AP invoice approval books the payable to the GL (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter(), new AccessDeniedFilter());
    const access = app.get(AccessService);
    access.registerRole({ id: 'role-ap-gl', name: 'AP GL Super', permissions: ['*'] });
    for (const u of [MAKER, CHECKER]) access.grant({ userId: u, roleId: 'role-ap-gl', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    const tenant = app.get(TenantContext);
    app.use((req: { headers: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void) => {
      const actorId = (req.headers['x-actor'] as string) || MAKER;
      tenant.run({ tenantId: TENANT, companyId: null, actorId, correlationId: 'e2e-ap-gl' }, () => next());
    });
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => { await app?.close(); });

  const income = async () =>
    (await http.get(`/api/v1/finance/statements/income-statement?from=${YEAR}-01-01&to=${YEAR}-12-31`).expect(200)).body;
  const balance = async () => (await http.get(`/api/v1/finance/statements/balance-sheet?asOf=${YEAR}-12-31`).expect(200)).body;

  it('approving a supplier invoice posts the expense and the payable, and the ledger balances', async () => {
    const expensesBefore = (await income()).totalExpenses ?? 0;
    const liabilitiesBefore = (await balance()).totalLiabilities ?? 0;

    // Created by MAKER; no PO, so the 3-way match passes by construction.
    const inv = (await http.post('/api/v1/finance/invoices').send({ title: 'Subcontractor works', value: 40_000 }).expect(201)).body;
    // Approved by a DIFFERENT authorised user (segregation of duties).
    await http.patch(`/api/v1/finance/invoices/${inv.id}/status`).set('x-actor', CHECKER).send({ status: 'approved' }).expect(200);

    expect((await income()).totalExpenses).toBeCloseTo(expensesBefore + 40_000, 2);
    const bs = await balance();
    expect(bs.totalLiabilities).toBeCloseTo(liabilitiesBefore + 40_000, 2);
    expect(bs.balanced).toBe(true);
  });
});
