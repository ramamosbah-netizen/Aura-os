// AURA OS — G3 Lead Qualification Engine e2e (HTTP).
//
// leadAttention (0156) answers "is anyone WORKING this lead?". This answers the question the Lead
// OS was missing: "is there a real commercial opportunity here, worth qualifying?" — with a score,
// how much we actually know (confidence), a recommendation, and the reasons behind it.
//
// The engine RECOMMENDS; a human QUALIFIES. Nothing here may change a lead's status by itself.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

interface Assessment {
  score: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  coverage: { rated: number; total: number };
  recommendation: 'QUALIFY' | 'NURTURE' | 'DISQUALIFY' | 'REVIEW';
  strengths: Array<{ key: string; label: string; value: number | null }>;
  gaps: Array<{ key: string; label: string; value: number | null }>;
}

describe('G3 lead qualification engine (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'lq-tenant', companyId: null, actorId: null, correlationId: 'e2e-lq' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const newLead = async (name: string): Promise<{ id: string; status: string }> =>
    (await http.post('/api/v1/crm/leads').send({ name, companyName: `${name} Co`, source: 'website' }).expect(201)).body;

  const assess = async (id: string, body: Record<string, unknown>): Promise<Assessment> =>
    ((await http.patch(`/api/v1/crm/leads/${id}/qualification`).send(body).expect(200)).body as { assessment: Assessment }).assessment;

  const read = async (id: string): Promise<{ assessment: Assessment; dimensions: Record<string, number>; notes: string | null }> =>
    (await http.get(`/api/v1/crm/leads/${id}/qualification`).expect(200)).body;

  it('an unassessed lead is honestly REVIEW — not a silent zero', async () => {
    const lead = await newLead('Unassessed');
    const { assessment } = await read(lead.id);
    expect(assessment.recommendation).toBe('REVIEW');
    expect(assessment.confidence).toBe('LOW');
    expect(assessment.coverage).toEqual({ rated: 0, total: 8 });
    expect(assessment.gaps).toHaveLength(8);
  });

  it('scores, explains itself, and persists', async () => {
    const lead = await newLead('Strong');
    const a = await assess(lead.id, {
      dimensions: {
        fit: 90, intent: 85, needConfidence: 80, timingReadiness: 75,
        authorityAccess: 30, commercialPotential: 90, relationshipStrength: 80, informationQuality: 70,
      },
      notes: 'Confirmed ELV retrofit, budget with the board',
    });
    expect(a.score).toBe(75);
    expect(a.confidence).toBe('HIGH');
    expect(a.recommendation).toBe('QUALIFY');
    // Never a bare number: the weak dimension is named as the thing to go and fix.
    expect(a.gaps.map((g) => g.key)).toContain('authorityAccess');
    expect(a.strengths.map((s) => s.key)).toContain('fit');

    const persisted = await read(lead.id);
    expect(persisted.assessment.score).toBe(75);
    expect(persisted.notes).toBe('Confirmed ELV retrofit, budget with the board');
  });

  it('dimensions MERGE — qualification is learned piecemeal, not re-entered', async () => {
    const lead = await newLead('Merge');
    await assess(lead.id, { dimensions: { fit: 80 } });
    // A later call that establishes budget must not wipe the fit someone rated yesterday.
    const a = await assess(lead.id, { dimensions: { commercialPotential: 60 } });
    expect(a.coverage.rated).toBe(2);
    const d = (await read(lead.id)).dimensions;
    expect(d).toMatchObject({ fit: 80, commercialPotential: 60 });
  });

  it('an explicit null withdraws a rating (a wrong score must be retractable)', async () => {
    const lead = await newLead('Retract');
    await assess(lead.id, { dimensions: { fit: 80, intent: 70, needConfidence: 60 } });
    const a = await assess(lead.id, { dimensions: { intent: null } });
    expect(a.coverage.rated).toBe(2);
    expect(Object.keys((await read(lead.id)).dimensions)).not.toContain('intent');
  });

  it('refuses a verdict it has not earned — a 95 from one dimension is REVIEW, not QUALIFY', async () => {
    const lead = await newLead('Thin');
    const a = await assess(lead.id, { dimensions: { fit: 95 } });
    expect(a.score).toBe(95);
    expect(a.confidence).toBe('LOW');
    expect(a.recommendation).toBe('REVIEW');
  });

  it('a genuinely poor lead is DISQUALIFY, with reasons', async () => {
    const lead = await newLead('Poor');
    const a = await assess(lead.id, {
      dimensions: { fit: 10, intent: 20, needConfidence: 15, timingReadiness: 10, authorityAccess: 20 },
    });
    expect(a.recommendation).toBe('DISQUALIFY');
    expect(a.gaps.map((g) => g.key)).toContain('fit');
  });

  it('the engine RECOMMENDS but never qualifies — status is a human act', async () => {
    const lead = await newLead('Advisory');
    const a = await assess(lead.id, {
      dimensions: { fit: 90, intent: 90, needConfidence: 90, timingReadiness: 90, authorityAccess: 90, commercialPotential: 90 },
    });
    expect(a.recommendation).toBe('QUALIFY');
    // A QUALIFY recommendation must not have moved the lead itself.
    const raw = (await http.get(`/api/v1/crm/leads/${lead.id}`).expect(200)).body as { status: string };
    expect(raw.status).toBe('new');
  });

  it('junk and out-of-range input cannot reach the store', async () => {
    const lead = await newLead('Junk');
    const a = await assess(lead.id, { dimensions: { fit: 500, winProbability: 99, nonsense: 'x' } });
    expect(a.coverage.rated).toBe(1); // only `fit` survived
    const d = (await read(lead.id)).dimensions;
    expect(d).toEqual({ fit: 100 }); // clamped
    expect(d).not.toHaveProperty('winProbability');
  });

  it('the Lead Center shows both questions: is it worth working, and is anyone working it', async () => {
    const lead = await newLead('Center');
    await assess(lead.id, { dimensions: { fit: 90, intent: 85, needConfidence: 80, timingReadiness: 75, authorityAccess: 70, commercialPotential: 80 } });

    const body = (await http.get('/api/v1/crm/leads/command').expect(200)).body as {
      leads: Array<{ id: string; qualification: Assessment; attention: { needsAttention: boolean } }>;
    };
    const row = body.leads.find((r) => r.id === lead.id)!;
    expect(row.qualification.score).toBe(80);
    expect(row.qualification.recommendation).toBe('QUALIFY');
    // Worth working AND unworked — the two axes are independent, which is the point.
    expect(row.attention.needsAttention).toBe(true);
  });
});
