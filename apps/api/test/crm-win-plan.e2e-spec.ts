// AURA OS — C2 Win Plan (§14 / G16), e2e (HTTP).
//
// The deal STRATEGY as a first-class fact: PATCH merges fields (unknown keys dropped, blanks
// nulled), the plan round-trips on the opportunity, and coverage is derived per read against
// DEAL SIZE — a small deal with the need + the play is complete; a strategic one is not.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('C2 win plan (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'c2-tenant', companyId: null, actorId: null, correlationId: 'e2e-c2' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('merges, persists and round-trips; unknown keys are dropped; coverage is size-aware', async () => {
    const opp = (await http.post('/api/v1/crm/opportunities').send({ title: 'Small AMC', value: 20_000 }).expect(201)).body;

    const first = (
      await http.patch(`/api/v1/crm/opportunities/${opp.id}/win-plan`)
        .send({ customerNeed: '  Renew the AMC  ', evilKey: 'nope' })
        .expect(200)
    ).body;
    expect(first.opportunity.winPlan.customerNeed).toBe('Renew the AMC');
    expect('evilKey' in first.opportunity.winPlan).toBe(false);
    expect(first.coverage.coverage).toBe(50); // need ✓, play ✗ — small deal expects two fields

    const second = (
      await http.patch(`/api/v1/crm/opportunities/${opp.id}/win-plan`).send({ winStrategy: 'Renew at same terms' }).expect(200)
    ).body;
    expect(second.opportunity.winPlan.customerNeed).toBe('Renew the AMC'); // patch semantics
    expect(second.coverage.coverage).toBe(100);
    expect(second.coverage.gaps).toEqual([]);

    // The plan rides the opportunity read itself.
    const read = (await http.get(`/api/v1/crm/opportunities/${opp.id}`).expect(200)).body;
    expect(read.winPlan.winStrategy).toBe('Renew at same terms');
  });

  it('the same two fields on a strategic deal are 20% with the gaps named', async () => {
    const opp = (await http.post('/api/v1/crm/opportunities').send({ title: 'Tower ELV', value: 900_000 }).expect(201)).body;
    const res = (
      await http.patch(`/api/v1/crm/opportunities/${opp.id}/win-plan`)
        .send({ customerNeed: 'Full ELV package', winStrategy: 'Lead with integration' })
        .expect(200)
    ).body;
    expect(res.coverage.coverage).toBe(20);
    expect(res.coverage.gaps.map((g: { key: string }) => g.key)).toEqual(
      expect.arrayContaining(['decisionCriteria', 'differentiation', 'procurementPath']),
    );
  });
});
