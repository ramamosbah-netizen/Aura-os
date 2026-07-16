// AURA OS — §23 forecast categories (G13), e2e (HTTP).
//
// One number (winProbability) was doing three jobs. This proves the separation over the wire:
// the category rides create/patch as the explicit human call (CLOSED refused — it is earned by
// the stage), the derivation covers uncalled deals, and the pipeline cockpit rolls all four
// buckets up with a zero COMMIT being a statement, not an omission.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

interface CategoryRow { category: string; deals: number; value: number; weighted: number }

describe('§23 forecast categories (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'fc-tenant', companyId: null, actorId: null, correlationId: 'e2e-fc' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('category rides create and patch; CLOSED and unknown values are refused', async () => {
    const opp = (
      await http.post('/api/v1/crm/opportunities')
        .send({ title: 'Called Deal', value: 100_000, winProbability: 10, forecastCategory: 'COMMIT' })
        .expect(201)
    ).body;
    expect(opp.forecastCategory).toBe('COMMIT');

    const patched = (await http.patch(`/api/v1/crm/opportunities/${opp.id}`).send({ forecastCategory: 'BEST_CASE' }).expect(200)).body;
    expect(patched.forecastCategory).toBe('BEST_CASE');

    await http.post('/api/v1/crm/opportunities').send({ title: 'Bad', forecastCategory: 'CLOSED' }).expect(400);
    await http.post('/api/v1/crm/opportunities').send({ title: 'Bad', forecastCategory: 'GUARANTEED' }).expect(400);
  });

  it('the pipeline cockpit rolls up all four buckets: explicit call beats confidence, won = CLOSED', async () => {
    // Uncalled low confidence → PIPELINE; uncalled 75 → COMMIT by threshold;
    // explicit COMMIT at 10 → COMMIT; sandbagged explicit PIPELINE at 95 → PIPELINE.
    await http.post('/api/v1/crm/opportunities').send({ title: 'FC P1', value: 100, winProbability: 15 }).expect(201);
    await http.post('/api/v1/crm/opportunities').send({ title: 'FC C1', value: 200, winProbability: 75 }).expect(201);
    await http.post('/api/v1/crm/opportunities').send({ title: 'FC C2', value: 300, winProbability: 10, forecastCategory: 'COMMIT' }).expect(201);
    await http.post('/api/v1/crm/opportunities').send({ title: 'FC S1', value: 400, winProbability: 95, forecastCategory: 'PIPELINE' }).expect(201);

    const pipeline = (await http.get('/api/v1/crm/opportunities/pipeline').expect(200)).body as { categories: CategoryRow[] };
    const by = Object.fromEntries(pipeline.categories.map((c) => [c.category, c]));
    expect(pipeline.categories.map((c) => c.category)).toEqual(['PIPELINE', 'BEST_CASE', 'COMMIT', 'CLOSED']);
    expect(by.COMMIT.deals).toBeGreaterThanOrEqual(2);
    expect(by.COMMIT.value).toBeGreaterThanOrEqual(500); // 200 + 300 — the explicit call at 10% commits
    expect(by.PIPELINE.value).toBeGreaterThanOrEqual(500); // 100 + the sandbagged 400
  });
});
