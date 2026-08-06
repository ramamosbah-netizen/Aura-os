// AURA OS — an approved variation raises the contract value (and the billing ceiling), over HTTP.
// The AR cap refuses billing above the contract and tells you to "raise a variation" first. That
// advice was unfollowable: variations lived on the project and rolled up into a derived revised
// value there, while the contract's own value never moved — so the only way to bill varied work
// was to hand-patch the contract. This proves the link, its idempotency, and that the cap follows.
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

const TENANT = 'variation-tenant';
const ACTOR = '00000000-0000-0000-0000-0000000000e1';
const CHECKER = '00000000-0000-0000-0000-0000000000e2';

async function settle<T>(fetcher: () => Promise<T>, ok: (v: T) => boolean, tries = 25): Promise<T> {
  let last = await fetcher();
  for (let i = 0; i < tries && !ok(last); i++) {
    await new Promise((r) => setTimeout(r, 25));
    last = await fetcher();
  }
  return last;
}

describe('Approved variation → contract value → billing ceiling (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let contractId: string;
  let projectId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter(), new AccessDeniedFilter());
    const access = app.get(AccessService);
    access.registerRole({ id: 'role-variation', name: 'Variation Super', permissions: ['*'] });
    for (const u of [ACTOR, CHECKER]) access.grant({ userId: u, roleId: 'role-variation', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    const tenant = app.get(TenantContext);
    app.use((req: { headers: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void) => {
      const actorId = (req.headers['x-actor'] as string) || ACTOR;
      tenant.run({ tenantId: TENANT, companyId: null, actorId, correlationId: 'e2e-variation' }, () => next());
    });
    await app.init();
    http = request(app.getHttpServer());

    const account = (await http.post('/api/v1/crm/accounts').send({ name: 'Nakheel' }).expect(201)).body;
    const contract = (
      await http.post('/api/v1/contracts/contracts')
        .send({ title: 'Marina ELV fit-out', reference: 'CT-VO-1', value: 500_000, accountId: account.id, accountName: account.name })
        .expect(201)
    ).body;
    contractId = contract.id;
    // Signing auto-creates the delivery project the variation is raised against.
    await asChecker(http.patch(`/api/v1/contracts/contracts/${contractId}/status`)).send({ status: 'active' }).expect(200);
    const projects = await settle(
      async () => (await http.get(`/api/v1/projects/projects?contractId=${contractId}`).expect(200)).body as Array<{ id: string }>,
      (rows) => rows.length > 0,
    );
    projectId = projects[0].id;
  });

  afterAll(async () => {
    await app?.close();
  });

  const asChecker = (r: request.Test) => r.set('x-actor', CHECKER);
  const value = async (): Promise<number> =>
    ((await http.get(`/api/v1/contracts/contracts/${contractId}`).expect(200)).body as { value: number }).value;

  it('records the award value and leaves it alone while the variation is unapproved', async () => {
    const contract = (await http.get(`/api/v1/contracts/contracts/${contractId}`).expect(200)).body;
    expect(contract.value).toBe(500_000);
    expect(contract.originalValue).toBe(500_000);

    const vo = (
      await http.post('/api/v1/projects/variations')
        .send({ projectId, title: 'Additional CCTV heads to level 3', type: 'addition', amount: 80_000, reference: 'VO-01' })
        .expect(201)
    ).body;
    await http.patch(`/api/v1/projects/variations/${vo.id}/status`).send({ status: 'submitted' }).expect(200);
    expect(await value()).toBe(500_000); // submitted is not approved
  });

  it('raises the contract value when the variation is approved', async () => {
    const [vo] = (await http.get(`/api/v1/projects/variations?projectId=${projectId}`).expect(200)).body as Array<{ id: string }>;
    await asChecker(http.patch(`/api/v1/projects/variations/${vo.id}/status`)).send({ status: 'approved' }).expect(200);

    const after = await settle(value, (v) => v === 580_000);
    expect(after).toBe(580_000);

    const contract = (await http.get(`/api/v1/contracts/contracts/${contractId}`).expect(200)).body;
    expect(contract.originalValue).toBe(500_000); // the award never moves
  });

  it('nets an omission off the same roll-up', async () => {
    const vo = (
      await http.post('/api/v1/projects/variations')
        .send({ projectId, title: 'Omit level 2 access control', type: 'omission', amount: 30_000, reference: 'VO-02' })
        .expect(201)
    ).body;
    await asChecker(http.patch(`/api/v1/projects/variations/${vo.id}/status`)).send({ status: 'approved' }).expect(200);
    expect(await settle(value, (v) => v === 550_000)).toBe(550_000); // 500k + 80k − 30k
  });

  it('lets the AR cap bill the varied work it previously refused', async () => {
    // 550,000 is now the ceiling. The original 500,000 award would have refused this.
    const raise = (net: number, number: string) =>
      http.post('/api/v1/finance/customer-invoices').send({
        invoiceNumber: number,
        customerName: 'Nakheel',
        contractRef: contractId,
        issueDate: '2026-08-06',
        lines: [{ description: 'Works to date incl. variations', quantity: 1, unitPrice: net, vatRate: 5 }],
      });
    await raise(540_000, `AR-VO-${Math.random().toString(36).slice(2, 8)}`).expect(201);

    // …and still refuses what the variations do NOT cover.
    const over = await raise(50_000, `AR-VO-${Math.random().toString(36).slice(2, 8)}`);
    expect(over.status).toBe(409);
    expect(String(over.body.message)).toMatch(/contract worth 550000/);
  });
});
