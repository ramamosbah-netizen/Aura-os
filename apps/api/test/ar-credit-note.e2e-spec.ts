// AURA OS — AR credit notes reduce revenue, the receivable, and the invoice balance (HTTP).
// A credit note is the mirror of a sales invoice: issuing it posts Dr Revenue / Dr VAT / Cr AR and
// reduces what the customer owes. This proves the full flow over HTTP and in the financial statements,
// plus the over-credit guard (409).
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

const TENANT = 'ar-cn-tenant';
const ACTOR = '00000000-0000-0000-0000-0000000000e1';
const YEAR = new Date().toISOString().slice(0, 4);
const TODAY = new Date().toISOString().slice(0, 10);

describe('AR credit notes (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter(), new AccessDeniedFilter());
    const access = app.get(AccessService);
    access.registerRole({ id: 'role-ar-cn', name: 'AR CN Super', permissions: ['*'] });
    access.grant({ userId: ACTOR, roleId: 'role-ar-cn', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) => {
      tenant.run({ tenantId: TENANT, companyId: null, actorId: ACTOR, correlationId: 'e2e-ar-cn' }, () => next());
    });
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => { await app?.close(); });

  const income = async () =>
    (await http.get(`/api/v1/finance/statements/income-statement?from=${YEAR}-01-01&to=${YEAR}-12-31`).expect(200)).body;

  const issuedInvoice = async (invoiceNumber: string, net: number) => {
    const created = (
      await http.post('/api/v1/finance/customer-invoices').send({
        invoiceNumber, customerName: 'Acme', issueDate: TODAY,
        lines: [{ description: 'ELV works', quantity: 1, unitPrice: net, vatRate: 5 }],
      }).expect(201)
    ).body;
    await http.post(`/api/v1/finance/customer-invoices/${created.id}/issue`).expect(201);
    return created;
  };

  it('issuing a credit note reduces revenue and the invoice balance', async () => {
    const inv = await issuedInvoice('AR-CN-1', 100_000); // 105,000 gross
    const revAfterInvoice = (await income()).totalRevenue;

    const cn = (
      await http.post('/api/v1/finance/credit-notes').send({
        creditNoteNumber: 'CN-1', customerInvoiceId: inv.id, reason: 'over-billing', issueDate: TODAY,
        lines: [{ description: 'correction', quantity: 1, unitPrice: 20_000, vatRate: 5 }], // 21,000 gross
      }).expect(201)
    ).body;
    await http.post(`/api/v1/finance/credit-notes/${cn.id}/issue`).expect(201);

    // Revenue drops by the credited net; the invoice now shows the credit against it.
    expect((await income()).totalRevenue).toBeCloseTo(revAfterInvoice - 20_000, 2);
    const updated = (await http.get(`/api/v1/finance/customer-invoices/${inv.id}`).expect(200)).body;
    expect(updated.creditedTotal).toBeCloseTo(21_000, 2);
  });

  it('rejects a credit note that exceeds what the invoice was billed (409)', async () => {
    const inv = await issuedInvoice('AR-CN-2', 5_000);
    await http.post('/api/v1/finance/credit-notes').send({
      creditNoteNumber: 'CN-2', customerInvoiceId: inv.id, issueDate: TODAY,
      lines: [{ description: 'too much', quantity: 1, unitPrice: 9_000, vatRate: 5 }],
    }).expect(409);
  });

  it('cannot issue the same credit note twice (409)', async () => {
    const inv = await issuedInvoice('AR-CN-3', 8_000);
    const cn = (
      await http.post('/api/v1/finance/credit-notes').send({
        creditNoteNumber: 'CN-3', customerInvoiceId: inv.id, issueDate: TODAY,
        lines: [{ description: 'fix', quantity: 1, unitPrice: 1_000, vatRate: 5 }],
      }).expect(201)
    ).body;
    await http.post(`/api/v1/finance/credit-notes/${cn.id}/issue`).expect(201);
    await http.post(`/api/v1/finance/credit-notes/${cn.id}/issue`).expect(409);
  });
});
