// AURA OS — the purchase-order state machine, over HTTP.
// changeStatus used to accept any string from any state; un-cancelling a PO left it live while its
// committed cost stayed reversed off the CBS. This proves the lifecycle guard and idempotent re-cancel.
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

const TENANT = 'po-sm-tenant';
const ACTOR = '00000000-0000-0000-0000-00000000ba01';

describe('Purchase order state machine (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter(), new AccessDeniedFilter());
    const access = app.get(AccessService);
    access.registerRole({ id: 'role-po-sm', name: 'PO SM Super', permissions: ['*'] });
    access.grant({ userId: ACTOR, roleId: 'role-po-sm', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) => {
      tenant.run({ tenantId: TENANT, companyId: null, actorId: ACTOR, correlationId: 'e2e-po-sm' }, () => next());
    });
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => { await app?.close(); });

  const newPo = async (value: number) =>
    (await http.post('/api/v1/procurement/purchase-orders').send({ title: 'Cables', supplierName: 'Nexans', value }).expect(201)).body;
  const setStatus = (id: string, status: string) => http.patch(`/api/v1/procurement/purchase-orders/${id}/status`).send({ status });

  it('will not un-cancel a cancelled PO (409)', async () => {
    const po = await newPo(5_000);
    await setStatus(po.id, 'cancelled').expect(200);
    await setStatus(po.id, 'issued').expect(409); // reviving a terminal PO
  });

  it('re-cancelling is an idempotent 200 (no error)', async () => {
    const po = await newPo(5_000);
    await setStatus(po.id, 'cancelled').expect(200);
    await setStatus(po.id, 'cancelled').expect(200);
  });

  it('rejects an unknown status', async () => {
    const po = await newPo(5_000);
    const res = await setStatus(po.id, 'shipped');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('rejects a backward move (received → draft) (409)', async () => {
    const po = await newPo(5_000); // small → auto-approved, can issue from draft
    await setStatus(po.id, 'issued').expect(200);
    await setStatus(po.id, 'received').expect(200);
    await setStatus(po.id, 'draft').expect(409);
  });
});
