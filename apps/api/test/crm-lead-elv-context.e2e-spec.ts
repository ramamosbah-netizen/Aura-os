// AURA OS — G4 ELV commercial context on the Lead, e2e (HTTP).
//
// A lead with a name, an email and a source is a CRM record. A lead an ELV contractor can act on
// says WHAT is needed, WHERE, for WHICH project, and WHO else is on it. This is also the data G3's
// fit / timingReadiness / commercialPotential were being rated WITHOUT.
//
// The full round-trip here is deliberate: it is what proves the store's COLS/placeholder/param
// alignment, which static counting cannot.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const FULL_CONTEXT = {
  requirement: 'CCTV + access control retrofit across 3 towers',
  systems: ['cctv', 'access_control'],
  sector: 'hospitality',
  projectName: 'Marina Hotel Retrofit',
  projectLocation: 'Dubai Marina',
  consultant: 'AECOM',
  mainContractor: 'ALEC',
  estimatedValue: 750000,
  projectStage: 'fit_out',
  expectedTimeline: 'Q3 2026',
};

describe('G4 ELV lead context (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'elv-tenant', companyId: null, actorId: null, correlationId: 'e2e-elv' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('captures the whole context on create and reads every field back unchanged', async () => {
    // The round-trip that proves store alignment: a misaligned INSERT lands values in the wrong
    // columns, which shows up here as a mismatch rather than as a silent production bug.
    const lead = (await http.post('/api/v1/crm/leads').send({ name: 'Khalid', companyName: 'Aldar', ...FULL_CONTEXT }).expect(201)).body;
    expect(lead).toMatchObject(FULL_CONTEXT);

    const reread = (await http.get(`/api/v1/crm/leads/${lead.id}`).expect(200)).body;
    expect(reread).toMatchObject(FULL_CONTEXT);
    // numeric(14,2) comes back from pg as a string — it must be a number by the time it leaves the API.
    expect(typeof reread.estimatedValue).toBe('number');
  });

  it('a lead with only a name still works — context is captured as it is learned', async () => {
    const lead = (await http.post('/api/v1/crm/leads').send({ name: 'Phone inquiry' }).expect(201)).body;
    expect(lead.requirement).toBeNull();
    expect(lead.systems).toBeNull();
    expect(lead.estimatedValue).toBeNull();
  });

  it('context can be added later by PATCH, one piece at a time', async () => {
    const lead = (await http.post('/api/v1/crm/leads').send({ name: 'Progressive' }).expect(201)).body;
    await http.patch(`/api/v1/crm/leads/${lead.id}`).send({ systems: ['fire_alarm'], sector: 'healthcare' }).expect(200);
    const after = (await http.patch(`/api/v1/crm/leads/${lead.id}`).send({ estimatedValue: 120000 }).expect(200)).body;
    expect(after.systems).toEqual(['fire_alarm']);
    expect(after.sector).toBe('healthcare');
    expect(after.estimatedValue).toBe(120000);
  });

  it('the system list is a routing key, not free text — a typo is refused at the edge', async () => {
    await http.post('/api/v1/crm/leads').send({ name: 'Typo', systems: ['cctv', 'cctvv'] }).expect(400);
    await http.post('/api/v1/crm/leads').send({ name: 'Bad sector', sector: 'spaceport' }).expect(400);
    await http.post('/api/v1/crm/leads').send({ name: 'Bad stage', projectStage: 'someday' }).expect(400);
  });

  it('conversion carries the estimate into the opportunity value', async () => {
    const lead = (await http.post('/api/v1/crm/leads').send({ name: 'Estimate', companyName: 'Emaar', estimatedValue: 450000 }).expect(201)).body;
    const res = (await http.post(`/api/v1/crm/leads/${lead.id}/convert`).send({ createNewAccount: true }).expect(201)).body;
    expect(res.opportunity.value).toBe(450000);
  });

  it('an explicit value at conversion beats the lead estimate — a decision is not overridden', async () => {
    const lead = (await http.post('/api/v1/crm/leads').send({ name: 'Override', companyName: 'Nakheel', estimatedValue: 450000 }).expect(201)).body;
    // The convert payload is FLAT (title/value/stage); the controller nests it into `opportunity`
    // internally. Sending a nested object here would be silently stripped by whitelist validation.
    const res = (await http.post(`/api/v1/crm/leads/${lead.id}/convert`).send({ createNewAccount: true, value: 600000 }).expect(201)).body;
    expect(res.opportunity.value).toBe(600000);
  });

  it('a lead that names its project titles the opportunity after the JOB, not the caller', async () => {
    const lead = (
      await http.post('/api/v1/crm/leads').send({
        name: 'Sara', companyName: 'Meraas', projectName: 'Bluewaters Tower 2', systems: ['cctv', 'access_control'],
      }).expect(201)
    ).body;
    const res = (await http.post(`/api/v1/crm/leads/${lead.id}/convert`).send({ createNewAccount: true }).expect(201)).body;
    expect(res.opportunity.title).toBe('Bluewaters Tower 2 — CCTV + Access Control');
  });

  it('falls back to the caller when there is no project name (nothing regressed)', async () => {
    const lead = (await http.post('/api/v1/crm/leads').send({ name: 'Anon', companyName: 'DAMAC' }).expect(201)).body;
    const res = (await http.post(`/api/v1/crm/leads/${lead.id}/convert`).send({ createNewAccount: true }).expect(201)).body;
    expect(res.opportunity.title).toBe('DAMAC — Anon');
  });
});
