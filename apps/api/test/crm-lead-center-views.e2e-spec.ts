// AURA OS — G7 Lead Center operational views, e2e (HTTP).
//
// The Lead Center could say "these leads need work" but not "what happened to the rest" —
// Converted and Disqualified were lumped into Nurture, and nothing answered "which sources
// actually produce work?". This spec proves the /command projection now carries all of it:
// per-status counts with honest Nurture semantics, and per-source funnel performance
// derived from the leads themselves (never stored).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

interface SourceRow {
  source: string;
  total: number;
  active: number;
  converted: number;
  disqualified: number;
  nurturing: number;
  conversionRate: number;
  avgAgeDays: number;
}

describe('G7 Lead Center views (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'g7-tenant', companyId: null, actorId: null, correlationId: 'e2e-g7' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const lead = async (name: string, over: Record<string, unknown> = {}): Promise<{ id: string }> =>
    (await http.post('/api/v1/crm/leads').send({ name, ...over }).expect(201)).body;

  const setStatus = (id: string, status: string) =>
    http.patch(`/api/v1/crm/leads/${id}`).send({ status }).expect(200);

  it('counts split Converted and Disqualified out of Nurture, and sources report the funnel', async () => {
    // referral: 2 leads, 1 converted → 50% conversion
    const r1 = await lead('Ref One', { source: 'referral' });
    await lead('Ref Two', { source: 'referral' });
    await http.post(`/api/v1/crm/leads/${r1.id}/convert`).send({}).expect(201);

    // exhibition: 2 leads — 1 disqualified, 1 nurturing → 0% conversion
    const e1 = await lead('Exh One', { source: 'exhibition' });
    const e2 = await lead('Exh Two', { source: 'exhibition' });
    await setStatus(e1.id, 'disqualified');
    await setStatus(e2.id, 'nurturing');

    // no source recorded — must surface as 'unknown', not vanish
    await lead('Walk In');

    const body = (await http.get('/api/v1/crm/leads/command').expect(200)).body as {
      counts: Record<string, number>;
      sources: SourceRow[];
    };

    expect(body.counts.all).toBe(5);
    expect(body.counts.converted).toBe(1);
    expect(body.counts.disqualified).toBe(1);
    // Nurture means parked-but-alive ONLY — the converted and the dead no longer hide in it.
    expect(body.counts.nurture).toBe(1);

    const referral = body.sources.find((s) => s.source === 'referral');
    expect(referral).toMatchObject({ total: 2, converted: 1, active: 1, conversionRate: 50 });

    const exhibition = body.sources.find((s) => s.source === 'exhibition');
    expect(exhibition).toMatchObject({ total: 2, converted: 0, disqualified: 1, nurturing: 1, active: 0, conversionRate: 0 });

    const unknown = body.sources.find((s) => s.source === 'unknown');
    expect(unknown).toMatchObject({ total: 1, active: 1 });
    expect(unknown!.avgAgeDays).toBeGreaterThanOrEqual(0);

    // Largest source first — the table reads by volume.
    expect(body.sources[0].total).toBeGreaterThanOrEqual(body.sources.at(-1)!.total);
  });
});
