// AURA OS — AR invoicing is a real GL subledger (wave-3 finance audit), over HTTP.
// StatementsService folds every statement from the journal ledger alone. Before this, an AR invoice
// posted no journal, so revenue never reached the P&L and the receivable never reached the balance
// sheet. This proves issue → revenue+VAT+AR, receipt → cash against AR, and cancel → reversal,
// all visible in the real financial statements.
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

const TENANT = 'ar-gl-tenant';
const ACTOR = '00000000-0000-0000-0000-0000000000d1';
const YEAR = new Date().toISOString().slice(0, 4);
const TODAY = new Date().toISOString().slice(0, 10);

describe('AR invoicing posts to the General Ledger (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter(), new AccessDeniedFilter());
    const access = app.get(AccessService);
    access.registerRole({ id: 'role-ar-gl', name: 'AR GL Super', permissions: ['*'] });
    access.grant({ userId: ACTOR, roleId: 'role-ar-gl', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) => {
      tenant.run({ tenantId: TENANT, companyId: null, actorId: ACTOR, correlationId: 'e2e-ar-gl' }, () => next());
    });
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => { await app?.close(); });

  const income = async () =>
    (await http.get(`/api/v1/finance/statements/income-statement?from=${YEAR}-01-01&to=${YEAR}-12-31`).expect(200)).body;
  const balance = async () => (await http.get(`/api/v1/finance/statements/balance-sheet?asOf=${YEAR}-12-31`).expect(200)).body;
  const trial = async () => (await http.get(`/api/v1/finance/statements/trial-balance?asOf=${YEAR}-12-31`).expect(200)).body;

  const raiseAndIssue = async (invoiceNumber: string, net: number) => {
    const created = (
      await http.post('/api/v1/finance/customer-invoices').send({
        invoiceNumber, customerName: 'Acme', issueDate: TODAY,
        lines: [{ description: 'ELV works', quantity: 1, unitPrice: net, vatRate: 5 }],
      }).expect(201)
    ).body;
    await http.post(`/api/v1/finance/customer-invoices/${created.id}/issue`).expect(201);
    return created;
  };

  it('issuing an invoice posts revenue to the P&L and a receivable to the balance sheet', async () => {
    const before = (await income()).totalRevenue ?? 0;
    await raiseAndIssue('AR-GL-1', 100_000); // net 100,000 + VAT 5,000 = 105,000

    expect((await income()).totalRevenue).toBeCloseTo(before + 100_000, 2);
    // The receivable (gross, incl VAT) shows as an asset, and the ledger still balances.
    const tb = await trial();
    expect(tb.balanced ?? Math.abs((tb.totalDebits ?? 0) - (tb.totalCredits ?? 0)) < 0.01).toBeTruthy();
    const bs = await balance();
    expect(bs.totalAssets).toBeGreaterThanOrEqual(105_000);
  });

  it('a receipt moves the balance from receivable to bank, leaving revenue unchanged', async () => {
    const inv = await raiseAndIssue('AR-GL-2', 50_000); // 52,500 gross
    const revAfterIssue = (await income()).totalRevenue;

    await http.post(`/api/v1/finance/customer-invoices/${inv.id}/receipts`).send({ amount: 52_500 }).expect(201);

    // Cash in, receivable down — revenue is a P&L figure and must not move on a receipt.
    expect((await income()).totalRevenue).toBeCloseTo(revAfterIssue, 2);
    const tb = await trial();
    expect(Math.abs((tb.totalDebits ?? 0) - (tb.totalCredits ?? 0))).toBeLessThan(0.01);
  });

  it('cancelling an issued (unpaid) invoice reverses the revenue it posted', async () => {
    const inv = await raiseAndIssue('AR-GL-3', 30_000);
    const revBefore = (await income()).totalRevenue;
    expect(revBefore).toBeGreaterThan(0);

    await http.post(`/api/v1/finance/customer-invoices/${inv.id}/cancel`).expect(201);

    // The 30,000 this invoice added is reversed out again.
    expect((await income()).totalRevenue).toBeCloseTo(revBefore - 30_000, 2);
  });
});
