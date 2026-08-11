// AURA OS — ELV device register over HTTP (Phase 3, G-21 / G-23).
//
// The device schedule and the cable schedule are both views over one collection. These tests
// exercise them as such: register devices, read the schedule filtered by system, read the
// cable/port fields back, walk the install → commission sequence, and ask what still blocks
// handover.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const PROJECT = '11111111-1111-1111-1111-111111111111';

describe('ELV device register (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  const register = (body: Record<string, unknown>) =>
    http.post('/api/v1/elv/devices').send({ projectId: PROJECT, ...body });

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    // Without this the domain guards escape as 500 and every taxonomy assertion below is
    // meaningless — the filter is what turns 'already exists' into 409 and 'only … can follow'
    // into 409 rather than an opaque server error.
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidUnknownValues: false,
        transformOptions: { exposeUnsetFields: false },
      }),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('registers a device and returns it with a canonical tag and system', async () => {
    const res = await register({
      tag: 'cam-l3-014',
      system: 'cctv',
      model: 'DS-2CD2143G2-I',
      location: 'Level 3 — East Corridor',
      macAddress: '001a.2b3c.4d5e',
      cableRef: 'C-CAM-L3-014',
      homeRunTo: 'RK-L3-01',
      portRef: 'PP1-14',
    });

    expect(res.status).toBeLessThan(300);
    expect(res.body.tag).toBe('CAM-L3-014');
    expect(res.body.system).toBe('cctv');
    expect(res.body.status).toBe('planned');
    // Normalised on the way in, so the same NIC is never two devices.
    expect(res.body.macAddress).toBe('00:1A:2B:3C:4D:5E');
  });

  it('resolves a legacy system spelling through the shared alias map', async () => {
    const res = await register({ tag: 'SPK-L1-002', system: 'pa_va' });
    expect(res.body.system).toBe('public_address');
  });

  it('refuses a second device with the same tag on the same project', async () => {
    await register({ tag: 'DUP-001', system: 'cctv' }).expect((r) => expect(r.status).toBeLessThan(300));
    const res = await register({ tag: 'dup-001', system: 'cctv' });
    // Same tag, different case — still the same device as far as a site engineer is concerned.
    // 409, not 400: the request is well-formed, the register's state is what forbids it. That is
    // the taxonomy's own distinction and the guard message lands on the right side of it.
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toMatch(/already exists/i);
  });

  it('serves the device schedule filtered by system', async () => {
    await register({ tag: 'ACS-DR-001', system: 'access_control' });
    const res = await http.get(`/api/v1/elv/devices?projectId=${PROJECT}&system=access_control`).expect(200);

    const tags = (res.body as Array<{ tag: string; system: string }>).map((d) => d.tag);
    expect(tags).toContain('ACS-DR-001');
    expect((res.body as Array<{ system: string }>).every((d) => d.system === 'access_control')).toBe(true);
  });

  it('carries the cable schedule on the same records — one collection, two views', async () => {
    const res = await http.get(`/api/v1/elv/devices?projectId=${PROJECT}&system=cctv`).expect(200);
    const cam = (res.body as Array<Record<string, string>>).find((d) => d.tag === 'CAM-L3-014');
    expect(cam?.cableRef).toBe('C-CAM-L3-014');
    expect(cam?.homeRunTo).toBe('RK-L3-01');
    expect(cam?.portRef).toBe('PP1-14');
  });

  it('walks the install sequence and refuses to skip termination', async () => {
    const created = await register({ tag: 'SEQ-001', system: 'cctv' });
    const id = created.body.id;
    const to = (status: string) => http.put(`/api/v1/elv/devices/${id}/status`).send({ status });

    await to('installed').expect((r) => expect(r.status).toBeLessThan(300));
    // Termination is the milestone a subcontractor claims against — it cannot be skipped.
    const skipped = await to('commissioned');
    expect(skipped.status).toBe(409);

    await to('terminated').expect((r) => expect(r.status).toBeLessThan(300));
    await to('tested').expect((r) => expect(r.status).toBeLessThan(300));
    const done = await to('commissioned');
    expect(done.body.status).toBe('commissioned');
  });

  it('patches a field correction and re-normalises the MAC', async () => {
    const created = await register({ tag: 'PATCH-001', system: 'network' });
    const res = await http
      .patch(`/api/v1/elv/devices/${created.body.id}`)
      .send({ macAddress: '00-1A-2B-3C-4D-FF', serialNumber: 'SN-9001' })
      .expect((r) => expect(r.status).toBeLessThan(300));

    expect(res.body.macAddress).toBe('00:1A:2B:3C:4D:FF');
    expect(res.body.serialNumber).toBe('SN-9001');
  });

  it('404s an unknown device rather than leaking a 500', async () => {
    await http.get('/api/v1/elv/devices/22222222-2222-2222-2222-222222222222').expect(404);
  });

  it('answers what still blocks handover, splitting "not commissioned" from "undocumented"', async () => {
    const res = await http.get(`/api/v1/elv/devices/punch-list?projectId=${PROJECT}`).expect(200);

    expect(res.body.total).toBeGreaterThan(0);
    // SEQ-001 is commissioned but has no serial, location or warranty date — it works, and it is
    // not ready. That distinction is the point of the endpoint.
    expect(res.body.undocumented).toBeGreaterThan(0);
    expect(res.body.notCommissioned).toBeGreaterThan(0);

    const seq = (res.body.blockers as Array<{ tag: string; missing: string[] }>).find((b) => b.tag === 'SEQ-001');
    expect(seq?.missing).toContain('serial number');
    expect(seq?.missing).not.toContain('not commissioned');
  });

  it('requires a projectId for the punch list — a tenant-wide punch list means nothing', async () => {
    await http.get('/api/v1/elv/devices/punch-list').expect(400);
  });
});
