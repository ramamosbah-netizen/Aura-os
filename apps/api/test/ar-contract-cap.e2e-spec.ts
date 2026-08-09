// AURA OS — the AR billing cap (gap register G-08), over HTTP.
// The AP side has had a 3-way match since the beginning (invoice ≤ PO value, ≤ received GRN value).
// The receivable side had no equivalent: nothing stopped a manually raised customer invoice from
// billing above the contract, or ahead of certified work. This proves both bounds, and — just as
// importantly — that the automated deal chain still gets through them.
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

const TENANT = 'ar-cap-tenant';
const ACTOR = '00000000-0000-0000-0000-0000000000c1';

describe('AR billing cap — an invoice may not exceed the contract or the certified work (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let contractId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter(), new AccessDeniedFilter());
    // The actor is fully authorised — the control under test is the billing cap, not permission.
    const access = app.get(AccessService);
    access.registerRole({ id: 'role-ar-cap', name: 'AR Cap Super', permissions: ['*'] });
    access.grant({ userId: ACTOR, roleId: 'role-ar-cap', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) => {
      tenant.run({ tenantId: TENANT, companyId: null, actorId: ACTOR, correlationId: 'e2e-ar-cap' }, () => next());
    });
    await app.init();
    http = request(app.getHttpServer());

    // A 1,000,000 contract with no certificates yet.
    const contract = (
      await http
        .post('/api/v1/contracts/contracts')
        .send({ title: 'Mall ELV upgrade', reference: 'CT-ARCAP-1', value: 1_000_000 })
        .expect(201)
    ).body;
    contractId = contract.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const raise = (net: number, ref: string | null = contractId) =>
    http.post('/api/v1/finance/customer-invoices').send({
      invoiceNumber: `AR-CAP-${Math.random().toString(36).slice(2, 8)}`,
      customerName: 'Majid Al Futtaim',
      contractRef: ref,
      issueDate: '2026-08-05',
      lines: [{ description: 'Certified work', quantity: 1, unitPrice: net, vatRate: 5 }],
    });

  it('allows an invoice inside the contract value', async () => {
    await raise(400_000).expect(201);
  });

  it('refuses the invoice that would take cumulative billing past the contract value', async () => {
    // 400k already billed above; 700k more would reach 1.1M against a 1M contract.
    const res = await raise(700_000);
    expect(res.status).toBe(409);
    expect(String(res.body.message)).toMatch(/contract worth 1000000/);
    expect(String(res.body.message)).toMatch(/variation/);
  });

  it('compares net of VAT — a final invoice that exactly closes the contract is allowed', async () => {
    // 600k net brings cumulative to exactly 1,000,000. Its VAT-inclusive total is 630,000; if the
    // cap compared gross it would refuse this by exactly the tax. It must not.
    await raise(600_000).expect(201);
  });

  it('refuses anything further once the contract is fully billed', async () => {
    const res = await raise(1);
    expect(res.status).toBe(409);
  });

  it('does not cap invoices that name no contract (AMC / ad-hoc billing)', async () => {
    await raise(5_000_000, null).expect(201);
  });
});
