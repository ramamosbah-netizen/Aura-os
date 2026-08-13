// AURA OS — assets / AMC / fleet governed workflows, e2e (HTTP).
//
// The last of gap G-08. These three were the modules left at CRUD after the delivery half was
// governed — asset registers rather than safety controls, but each carries a refusal that keeps a
// financial or recovery record honest:
//
//   amc:    a work order cannot be raised under a dead contract, cannot be completed unassigned,
//           and stamps its SLA outcome from the contract that governed it
//   assets: an asset cannot be disposed while maintenance is open, and stops depreciating once it is
//   fleet:  a disputed fine has a way out — it used to be a dead end
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('assets / AMC / fleet governed workflows (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'gaf-e2e', companyId: null, actorId: null, correlationId: 'e2e-gaf' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const AMC = '/api/v1/amc';
  const ASSETS = '/api/v1/assets';
  const FLEET = '/api/v1/fleet';
  const DAY = 86_400_000;

  // ── AMC ────────────────────────────────────────────────────────────────────

  it('refuses a work order under an inactive contract, and stamps the SLA outcome under a live one', async () => {
    const live = (
      await http.post(`${AMC}/contracts`).send({
        contractNumber: `AMC-LIVE-${Date.now()}`,
        clientName: 'Emaar',
        serviceScope: 'ELV maintenance',
        startDate: new Date(Date.now() - 30 * DAY).toISOString(),
        endDate: new Date(Date.now() + 30 * DAY).toISOString(),
        value: 100000,
        slaResolutionHours: 24,
      }).expect(201)
    ).body;

    // A live contract dispatches work.
    const wo = (
      await http.post(`${AMC}/work-orders`).send({
        contractId: live.id, orderNumber: `WO-${Date.now()}`, description: 'Compressor swap',
      }).expect(201)
    ).body;
    expect(wo.status).toBe('open');

    // Completion is refused until somebody is actually on the job.
    await http.post(`${AMC}/work-orders/${wo.id}/complete`).send({ cost: 100 }).expect(409);

    await http.post(`${AMC}/work-orders/${wo.id}/assign`).send({ technicianId: 'tech-1' }).expect(201);
    const done = (await http.post(`${AMC}/work-orders/${wo.id}/complete`).send({ cost: 1500 }).expect(201)).body;
    expect(done.status).toBe('completed');
    expect(done.slaResolutionHours).toBe(24);
    expect(done.slaMet).toBe(true);

    // Terminal: a finished visit is not completed twice.
    await http.post(`${AMC}/work-orders/${wo.id}/complete`).send({}).expect(409);

    // Now kill the contract — no further work may be raised against it.
    await http.post(`${AMC}/contracts/${live.id}/terminate`).expect(201);
    const refused = await http.post(`${AMC}/work-orders`).send({
      contractId: live.id, orderNumber: `WO-DEAD-${Date.now()}`, description: 'Should be refused',
    }).expect(409);
    expect(String(refused.body.message ?? refused.body.error)).toMatch(/active service contract/i);
  });

  it('exposes the work order 360 with its governing contract', async () => {
    const wo = (
      await http.post(`${AMC}/work-orders`).send({ orderNumber: `WO-ADHOC-${Date.now()}`, description: 'Goodwill' }).expect(201)
    ).body;
    const detail = (await http.get(`${AMC}/work-orders/${wo.id}/detail`).expect(200)).body;
    expect(detail.order.id).toBe(wo.id);
    // Ad-hoc: no contract, so no SLA to measure against.
    expect(detail.contract).toBeNull();
  });

  // ── Assets ─────────────────────────────────────────────────────────────────

  it('refuses disposal while maintenance is open, and stops depreciation once disposed', async () => {
    const asset = (
      await http.post(ASSETS).send({
        name: 'Generator', serialNumber: `GEN-${Date.now()}`, category: 'Plant',
        purchaseDate: '2026-01-01', purchaseCost: 100000,
      }).expect(201)
    ).body;

    // Scheduling work takes it out of service.
    const job = (
      await http.post(`${ASSETS}/maintenance`).send({
        assetId: asset.id, date: '2026-07-15', description: 'Rewind alternator',
      }).expect(201)
    ).body;
    const outOfService = (await http.get(`${ASSETS}/${asset.id}/detail`).expect(200)).body;
    expect(outOfService.asset.status).toBe('maintenance');
    expect(outOfService.openMaintenance).toBe(1);

    // Disposal is refused while that job is open.
    const blocked = await http.post(`${ASSETS}/disposals`).send({
      assetId: asset.id, method: 'sale', disposalDate: '2026-08-01', proceeds: 40000, bookValue: 35000,
    }).expect(409);
    expect(String(blocked.body.message ?? blocked.body.error)).toMatch(/maintenance is complete/i);

    // Completing the last job returns it to service and releases the gate.
    await http.put(`${ASSETS}/maintenance/${job.id}/complete`).send({ actualCost: 4200 }).expect(200);
    const back = (await http.get(`${ASSETS}/${asset.id}/detail`).expect(200)).body;
    expect(back.asset.status).toBe('active');

    await http.post(`${ASSETS}/disposals`).send({
      assetId: asset.id, method: 'sale', disposalDate: '2026-08-01', proceeds: 40000, bookValue: 35000,
    }).expect(201);

    // Disposed is terminal, and a settled asset stops depreciating.
    await http.post(`${ASSETS}/disposals`).send({
      assetId: asset.id, method: 'sale', disposalDate: '2026-08-02', proceeds: 1, bookValue: 1,
    }).expect(409);
    const dep = await http.get(`${ASSETS}/${asset.id}/depreciation?usefulLifeMonths=60`).expect(409);
    expect(String(dep.body.message ?? dep.body.error)).toMatch(/not disposed/i);
  });

  // ── Fleet ──────────────────────────────────────────────────────────────────

  it('gives a disputed traffic fine both ways out', async () => {
    const vehicle = (
      await http.post(`${FLEET}/vehicles`).send({
        plateNumber: `D-${Date.now() % 100000}`, make: 'Toyota', model: 'Hilux', year: 2024,
      }).expect(201)
    ).body;

    const raise = (violation: string) =>
      http.post(`${FLEET}/fines`).send({
        vehicleId: vehicle.id, fineNumber: `DXB-${Math.random().toString().slice(2, 8)}`,
        violation, amount: 600, blackPoints: 4, fineDate: '2026-07-01',
      }).expect(201);

    // 1. Dispute rejected → back to pending, recovery resumes.
    const a = (await raise('Speeding')).body;
    await http.put(`${FLEET}/fines/${a.id}/dispute`).expect(200);
    await http.put(`${FLEET}/fines/${a.id}/pay`).send({}).expect(409); // still refused mid-dispute

    const reopened = (await http.put(`${FLEET}/fines/${a.id}/resolve-dispute`).send({ upheld: false }).expect(200)).body;
    expect(reopened.status).toBe('pending');
    await http.put(`${FLEET}/fines/${a.id}/assign`).send({ driverEmployeeId: 'emp-9' }).expect(200);
    expect((await http.put(`${FLEET}/fines/${a.id}/pay`).send({}).expect(200)).body.status).toBe('paid');

    // 2. Dispute upheld → cancelled, terminal, nothing to recover.
    const b = (await raise('Parking')).body;
    await http.put(`${FLEET}/fines/${b.id}/dispute`).expect(200);
    const cancelled = (await http.put(`${FLEET}/fines/${b.id}/resolve-dispute`).send({ upheld: true }).expect(200)).body;
    expect(cancelled.status).toBe('cancelled');
    await http.put(`${FLEET}/fines/${b.id}/pay`).send({}).expect(409);

    // 3. Resolving a dispute nobody raised is a conflict, and `upheld` is mandatory.
    const c = (await raise('Red light')).body;
    await http.put(`${FLEET}/fines/${c.id}/resolve-dispute`).send({ upheld: true }).expect(409);
    await http.put(`${FLEET}/fines/${c.id}/dispute`).expect(200);
    await http.put(`${FLEET}/fines/${c.id}/resolve-dispute`).send({}).expect(400);
  });
});
