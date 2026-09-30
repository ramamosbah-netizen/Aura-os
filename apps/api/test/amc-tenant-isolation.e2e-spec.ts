import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * AMC TENANT ISOLATION — the tenant comes from the session, never from the request.
 *
 * Ten AMC routes took `body.tenantId` or `?tenantId=` first and fell back to the session (and the
 * session to a literal 'default'), so any caller could read or write another tenant's service
 * contracts, tickets and work orders by naming it; every by-id action — read a contract, terminate
 * it, assign or complete a work order, resolve a ticket — found the record with no tenant check at
 * all; and a work order, ticket or PPM schedule could hang off another tenant's contract. In
 * PostgreSQL RLS may have masked some of this; the in-memory stores have no backstop, and trusting a
 * client-supplied tenant is wrong either way.
 *
 * Auth ON, the shipped r-service-manager in two tenants. The caller in A must not read, create in,
 * sweep or act on B through a body/query tenant, must not reach B's records by id, and must not
 * attach its own records to B's contract — each refused as 403 (a named foreign tenant) or 404 (an
 * id it may not know exists). Its own work goes through, including a request that names its OWN
 * tenant.
 */
it('AMC: a caller in one tenant can neither read nor write another tenant\'s contracts, tickets or work orders', async () => {
  const previous = process.env.AUTH_JWT_SECRET;
  process.env.AUTH_JWT_SECRET = 'isolated-amc-tenant-secret';
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const auth = app.get(AuthService);
  const tenant = app.get(TenantContext);
  const access = app.get(AccessService);
  const users = app.get(UsersService);
  app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
    const context = await auth.contextFromHeader(req.headers.authorization);
    if (!context) { res.status(401).end(); return; }
    tenant.run(context, next);
  });
  await app.init();
  try {
    expect(auth.enabled, 'worthless with auth off — the guard and the session tenant would never run').toBe(true);
    const A = `amc-a-${Date.now()}`;
    const B = `amc-b-${Date.now()}`;
    const seat = (userId: string, t: string) => {
      access.grant({ userId, roleId: 'r-service-manager', scope: { kind: 'org', level: 'tenant', id: t } });
      users.save({ tenantId: t, userId, displayName: userId, active: true });
    };
    seat('amc-sm-a', A);
    seat('amc-sm-b', B);
    const client = (userId: string, t: string) => request.agent(app.getHttpServer()).set('Authorization', `Bearer ${auth.mint({ sub: userId, tenantId: t })}`);
    const a = client('amc-sm-a', A);
    const b = client('amc-sm-b', B);
    const contract = (n: string) => ({
      contractNumber: n, clientName: `Client ${n}`, serviceScope: 'CCTV and access control maintenance',
      startDate: '2026-01-01', endDate: '2027-12-31', value: 120_000,
    });

    // ── B's own records, made by B ───────────────────────────────────────────────────────────────
    const bContract = (await b.post('/api/v1/amc/contracts').send(contract('AMC-B-1')).expect(201)).body;
    expect(bContract.tenantId).toBe(B);
    const bTicket = (await b.post('/api/v1/amc/tickets').send({ ticketNumber: 'T-B-1', title: 'Camera offline', description: 'Gate 2', reportedBy: 'guard', contractId: bContract.id }).expect(201)).body;
    const bOrder = (await b.post('/api/v1/amc/work-orders').send({ orderNumber: 'WO-B-1', description: 'Replace PSU', contractId: bContract.id }).expect(201)).body;
    const bPpm = (await b.post('/api/v1/amc/ppm-schedules').send({ contractId: bContract.id, taskDescription: 'Quarterly clean', frequency: 'quarterly' }).expect(201)).body;

    // ── A NAMING B in the body or the query: refused, and nothing written ─────────────────────────
    const named = [
      a.post('/api/v1/amc/contracts').send({ ...contract('AMC-SPOOF'), tenantId: B }),
      a.post('/api/v1/amc/tickets').send({ ticketNumber: 'T-SPOOF', title: 'x', description: 'x', reportedBy: 'x', tenantId: B }),
      a.post('/api/v1/amc/work-orders').send({ orderNumber: 'WO-SPOOF', description: 'x', tenantId: B }),
      a.post('/api/v1/amc/tickets/sla-sweep').send({ tenantId: B }),
      a.get(`/api/v1/amc/contracts?tenantId=${B}`),
      a.get(`/api/v1/amc/tickets?tenantId=${B}`),
      a.get(`/api/v1/amc/tickets/sla-status?tenantId=${B}`),
      a.get(`/api/v1/amc/work-orders?tenantId=${B}`),
      a.get(`/api/v1/amc/dispatch-board?tenantId=${B}`),
      a.get(`/api/v1/amc/ppm-schedules?tenantId=${B}`),
    ];
    for (const res of await Promise.all(named)) {
      expect(res.status, `${res.req.method} ${res.req.path} → ${JSON.stringify(res.body)}`).toBe(403);
      expect(res.body.message).toBe('the tenant is taken from your session, never from the request');
    }
    const bContracts = (await b.get('/api/v1/amc/contracts').expect(200)).body as Array<{ contractNumber: string }>;
    expect(bContracts.map((c) => c.contractNumber), 'nothing A named landed in B').toEqual(['AMC-B-1']);
    expect(((await b.get('/api/v1/amc/tickets').expect(200)).body as unknown[]).length).toBe(1);
    expect(((await b.get('/api/v1/amc/work-orders').expect(200)).body as unknown[]).length).toBe(1);

    // ── A holding B's ids: every one reads as "not found" ────────────────────────────────────────
    const byId = [
      a.get(`/api/v1/amc/contracts/${bContract.id}`),
      a.post(`/api/v1/amc/contracts/${bContract.id}/terminate`).send({ reason: 'hostile' }),
      a.get(`/api/v1/amc/tickets/${bTicket.id}`),
      a.post(`/api/v1/amc/tickets/${bTicket.id}/assign`).send({ technicianId: 'tech-a' }),
      a.post(`/api/v1/amc/tickets/${bTicket.id}/resolve`).send({}),
      a.get(`/api/v1/amc/work-orders/${bOrder.id}/detail`),
      a.post(`/api/v1/amc/work-orders/${bOrder.id}/assign`).send({ technicianId: 'tech-a' }),
      a.post(`/api/v1/amc/work-orders/${bOrder.id}/start`).send({}),
      a.post(`/api/v1/amc/work-orders/${bOrder.id}/cancel`).send({ reason: 'hostile' }),
      a.post(`/api/v1/amc/work-orders/${bOrder.id}/complete`).send({ cost: 1 }),
      a.post(`/api/v1/amc/ppm-schedules/${bPpm.id}/deactivate`).send({}),
      // …and A's own new records may not hang off B's contract.
      a.post('/api/v1/amc/work-orders').send({ orderNumber: 'WO-A-BORROW', description: 'x', contractId: bContract.id }),
      a.post('/api/v1/amc/tickets').send({ ticketNumber: 'T-A-BORROW', title: 'x', description: 'x', reportedBy: 'x', contractId: bContract.id }),
      a.post('/api/v1/amc/ppm-schedules').send({ contractId: bContract.id, taskDescription: 'x', frequency: 'monthly' }),
    ];
    for (const res of await Promise.all(byId)) {
      expect(res.status, `${res.req.method} ${res.req.path} → ${JSON.stringify(res.body)}`).toBe(404);
    }

    // B's records are untouched by all of that.
    expect((await b.get(`/api/v1/amc/contracts/${bContract.id}`).expect(200)).body.status).toBe('active');
    const bOrderNow = (await b.get(`/api/v1/amc/work-orders/${bOrder.id}/detail`).expect(200)).body.order;
    expect(bOrderNow.status, 'not assigned, started, cancelled or completed by A').toBe('open');
    expect((await b.get(`/api/v1/amc/tickets/${bTicket.id}`).expect(200)).body.status).toBe('open');

    // ── A's own work goes through — including a request that names A's own tenant ────────────────
    const aContract = (await a.post('/api/v1/amc/contracts').send({ ...contract('AMC-A-1'), tenantId: A }).expect(201)).body;
    expect(aContract.tenantId).toBe(A);
    await a.post('/api/v1/amc/work-orders').send({ orderNumber: 'WO-A-1', description: 'Annual check', contractId: aContract.id }).expect(201);
    expect(((await a.get(`/api/v1/amc/contracts?tenantId=${A}`).expect(200)).body as Array<{ contractNumber: string }>).map((c) => c.contractNumber)).toEqual(['AMC-A-1']);
    expect((await a.get(`/api/v1/amc/contracts/${aContract.id}`).expect(200)).body.contractNumber).toBe('AMC-A-1');
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.AUTH_JWT_SECRET;
    else process.env.AUTH_JWT_SECRET = previous;
  }
});
