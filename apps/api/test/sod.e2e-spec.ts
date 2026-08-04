// AURA OS — segregation of duties (maker-checker) across the commercial money cycle, over HTTP.
// The preparer of a record may not authorise it themselves: a contract signer, an IPC certifier and
// an invoice approver must each differ from the record's creator. A different authorised user passes;
// system/auto transitions (no actor) are unaffected. Mirrors the existing quotation-approval rule.
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

const TENANT = 'sod-tenant';
const MAKER = '00000000-0000-0000-0000-0000000000a1';
const CHECKER = '00000000-0000-0000-0000-0000000000a2';

describe('segregation of duties — maker-checker across the money cycle (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    // Mirror main.ts: the taxonomy filter maps domain "access denied" errors → 403 (without it,
    // the SoD guard's plain Error would surface as a generic 500 in this bootstrap).
    app.useGlobalFilters(new AllExceptionsFilter(), new AccessDeniedFilter());
    // Both users are authorised (wildcard) — the control under test is maker≠checker, not permission.
    const access = app.get(AccessService);
    access.registerRole({ id: 'role-sod', name: 'SoD Super', permissions: ['*'] });
    for (const u of [MAKER, CHECKER]) access.grant({ userId: u, roleId: 'role-sod', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    // The acting user comes from the x-actor header (defaults to MAKER), so one suite can act as either.
    const tenant = app.get(TenantContext);
    app.use((req: { headers: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void) => {
      const actorId = (req.headers['x-actor'] as string) || MAKER;
      tenant.run({ tenantId: TENANT, companyId: null, actorId, correlationId: 'e2e-sod' }, () => next());
    });
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const asChecker = (r: request.Test) => r.set('x-actor', CHECKER);

  it('Contract sign: the preparer cannot sign their own contract; a different user can', async () => {
    const contract = (await http.post('/api/v1/contracts/contracts').send({ title: 'Fire Alarm Supply', value: 500_000 }).expect(201)).body; // created by MAKER

    const self = await http.patch(`/api/v1/contracts/contracts/${contract.id}/status`).send({ status: 'active' });
    expect(self.status).toBe(403);
    expect(self.body.message).toMatch(/cannot sign their own contract/i);

    await asChecker(http.patch(`/api/v1/contracts/contracts/${contract.id}/status`)).send({ status: 'active' }).expect(200);
    expect((await http.get(`/api/v1/contracts/contracts/${contract.id}`).expect(200)).body.status).toBe('active');
  });

  it('IPC certify: the preparer cannot certify their own certificate; a different user can', async () => {
    // A signed contract to bill against (signed by the checker, so the contract SoD is satisfied).
    const contract = (await http.post('/api/v1/contracts/contracts').send({ title: 'MEP Works', value: 1_000_000 }).expect(201)).body;
    await asChecker(http.patch(`/api/v1/contracts/contracts/${contract.id}/status`)).send({ status: 'active' }).expect(200);

    const ipc = (await http.post('/api/v1/contracts/certificates').send({ contractId: contract.id, cumulativeWorkDone: 200_000 }).expect(201)).body; // created by MAKER

    const self = await http.patch(`/api/v1/contracts/certificates/${ipc.id}/status`).send({ status: 'certified' });
    expect(self.status).toBe(403);
    expect(self.body.message).toMatch(/cannot certify their own IPC/i);

    await asChecker(http.patch(`/api/v1/contracts/certificates/${ipc.id}/status`)).send({ status: 'certified' }).expect(200);
    expect((await http.get(`/api/v1/contracts/certificates/${ipc.id}`).expect(200)).body.status).toBe('certified');
  });

  it('Invoice approve: the preparer cannot approve their own invoice (SoD fires before the 3-way match)', async () => {
    const invoice = (await http.post('/api/v1/finance/invoices').send({ title: 'Consultancy fee', value: 10_000 }).expect(201)).body; // created by MAKER

    const self = await http.patch(`/api/v1/finance/invoices/${invoice.id}/status`).send({ status: 'approved' });
    expect(self.status).toBe(403);
    expect(self.body.message).toMatch(/cannot approve their own invoice/i);
  });
});
