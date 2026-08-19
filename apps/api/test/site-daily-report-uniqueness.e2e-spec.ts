import 'reflect-metadata';

process.env.AUTH_DEFAULT_TENANT = 'site-unique-tenant';
delete process.env.AUTH_JWT_SECRET;
delete process.env.AUTH_REQUIRED;

import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { AccessDeniedFilter } from '../src/auth/access-denied.filter';

/**
 * One daily report per project per day.
 *
 * The schema has carried `UNIQUE (tenant_id, project_id, date)` all along, but the rule was only
 * enforced there — and, until the upsert arbiter was corrected, not even there: the insert said
 * `on conflict (tenant_id, project_id, date) do update`, so a second report with a DIFFERENT id
 * silently overwrote the first one in place. Two engineers filing the same day's diary meant the
 * second replaced the first, and every test stayed green.
 *
 * These assertions are deliberately about the DATA, not only the status code: a 409 with the first
 * report quietly mutated underneath it would be the same bug wearing a better error message.
 */
const DATE = '2026-07-15';

describe('daily reports are unique per project per day (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    // The taxonomy lives in these filters: without them a plain domain Error is a bare 500 and the
    // spec would be asserting Nest defaults rather than the product's contract.
    app.useGlobalFilters(new AllExceptionsFilter(), new AccessDeniedFilter());
    await app.init();
    http = request(app.getHttpServer());

    const project = await http
      .post('/api/v1/projects/projects')
      .send({ title: 'Uniqueness fixture', reference: 'PX-UNIQ-1', status: 'active', value: 1000 })
      .expect(201);
    projectId = project.body.id as string;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('refuses a second report for the same project and date, and leaves the first one intact', async () => {
    const first = await http
      .post('/api/v1/site/daily-reports')
      .send({ projectId, date: DATE, workDescription: 'First filing — L2 containment' })
      .expect(201);
    const firstId = first.body.id as string;

    // A different report, same project, same day.
    const second = await http
      .post('/api/v1/site/daily-reports')
      .send({ projectId, date: DATE, workDescription: 'Second filing — should be refused' })
      .expect(409);
    expect(second.body.message).toMatch(/already exists for this project/i);
    // The refusal names the day, so the person reading it knows which filing collided.
    expect(second.body.message).toContain(DATE);
    // And it never leaks the constraint.
    expect(JSON.stringify(second.body)).not.toMatch(/duplicate key|unique constraint/i);

    // THE POINT: the first report is untouched — not overwritten by the second one's content.
    const reread = await http.get(`/api/v1/site/daily-reports/${firstId}`).expect(200);
    expect(reread.body.report.workDescription).toBe('First filing — L2 containment');
    expect(reread.body.report.id).toBe(firstId);

    // And exactly one report exists for that project and day.
    const all = await http.get('/api/v1/site/daily-reports').expect(200);
    const forThatDay = (all.body as Array<{ projectId: string; date: string }>).filter(
      (r) => r.projectId === projectId && r.date === DATE,
    );
    expect(forThatDay).toHaveLength(1);
  });

  it('allows the same project on a different day', async () => {
    await http
      .post('/api/v1/site/daily-reports')
      .send({ projectId, date: '2026-07-16', workDescription: 'Next day is a different report' })
      .expect(201);
  });
});
