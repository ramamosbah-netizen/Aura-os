// AURA OS — health-dimension realignment (vision §21), e2e (HTTP).
//
// The S7 engine measured relationship/commitments/register/journey/risks — evidence mislabelled
// as dimensions. This proves the realigned engine over the wire: the five dimensions the vision
// names (Execution / Relationship / Commercial / Competitive / Decision), the five-state verdict
// (ON_TRACK / NEEDS_ATTENTION / AT_RISK / BLOCKED / STALE), and that the verdict reads the REAL
// deal facts — owner, next action, value, close date, competitors, the Activity stream.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('health dimensions §21 (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'hd-tenant', companyId: null, actorId: null, correlationId: 'e2e-hd' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const futureIso = (days: number): string => new Date(Date.now() + days * 86400000).toISOString();

  it('an unworked deal reads STALE with the execution gaps named', async () => {
    const opp = (await http.post('/api/v1/crm/opportunities').send({ title: 'Bare Deal', value: 0 }).expect(201)).body;
    const depth = (await http.get(`/api/v1/crm/opportunities/${opp.id}/depth`).expect(200)).body;

    expect(depth.health.dimensions.map((d: { key: string }) => d.key))
      .toEqual(['execution', 'relationship', 'commercial', 'competitive', 'decision']);
    expect(depth.health.state).toBe('STALE');
    expect(depth.health.reasons).toEqual(expect.arrayContaining(['no next action', 'no activity ever logged', 'no deal value recorded']));
  });

  it('working the deal moves the verdict: activity + next action + committee + facts → ON_TRACK', async () => {
    const opp = (
      await http.post('/api/v1/crm/opportunities').send({
        title: 'Worked Deal', value: 300_000, stage: 'negotiation',
        nextAction: 'Send revised BOQ', nextActionDueDate: futureIso(5),
        closeDate: futureIso(45).slice(0, 10), competitors: 'Incumbent Co',
      }).expect(201)
    ).body;
    // Touch the deal through the Activity stream — execution recency comes from here, not a column.
    await http.post('/api/v1/crm/activities').send({ type: 'call', subject: 'Intro call', relatedType: 'opportunity', relatedId: opp.id }).expect(201);
    // Map the buying committee.
    for (const [contactName, role] of [['Dana', 'DECISION_MAKER'], ['Omar', 'ECONOMIC_BUYER'], ['Sara', 'CHAMPION']] as const) {
      await http.post(`/api/v1/crm/opportunities/${opp.id}/stakeholders`).send({ contactName, role }).expect(201);
    }

    const depth = (await http.get(`/api/v1/crm/opportunities/${opp.id}/depth`).expect(200)).body;
    expect(depth.health.state).toBe('ON_TRACK');
    expect(depth.health.needsAttention).toBe(false);
  });

  it('an unmitigated critical risk BLOCKS the deal and names itself; mitigating un-blocks', async () => {
    const opp = (
      await http.post('/api/v1/crm/opportunities').send({
        title: 'Risky Deal', value: 100_000, nextAction: 'Follow up', nextActionDueDate: futureIso(3),
      }).expect(201)
    ).body;
    const risk = (
      await http.post(`/api/v1/crm/opportunities/${opp.id}/risks`)
        .send({ title: 'Payment terms rejected', type: 'COMMERCIAL', likelihood: 'high', impact: 'high' })
        .expect(201)
    ).body;

    const blocked = (await http.get(`/api/v1/crm/opportunities/${opp.id}/depth`).expect(200)).body;
    expect(blocked.health.state).toBe('BLOCKED');
    expect(blocked.health.stateReason).toContain('Payment terms rejected');
    // The commercial risk lands on the commercial dimension as evidence.
    const com = blocked.health.dimensions.find((d: { key: string }) => d.key === 'commercial');
    expect(com.reasons.join(' ')).toContain('Payment terms rejected');

    await http.post(`/api/v1/crm/opportunities/${opp.id}/risks/${risk.id}/status`).send({ status: 'MITIGATING' }).expect(201);
    const after = (await http.get(`/api/v1/crm/opportunities/${opp.id}/depth`).expect(200)).body;
    expect(after.health.state).not.toBe('BLOCKED');
  });

  it('reaching proposal without knowing the competition is a competitive finding', async () => {
    const opp = (
      await http.post('/api/v1/crm/opportunities').send({
        title: 'Blind Proposal', value: 50_000, stage: 'proposal',
        nextAction: 'Present', nextActionDueDate: futureIso(2),
      }).expect(201)
    ).body;
    const depth = (await http.get(`/api/v1/crm/opportunities/${opp.id}/depth`).expect(200)).body;
    const comp = depth.health.dimensions.find((d: { key: string }) => d.key === 'competitive');
    expect(comp.applicable).toBe(true);
    expect(comp.reasons).toContain('competitive landscape unknown at this stage');
  });
});
