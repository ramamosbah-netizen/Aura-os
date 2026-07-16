// AURA OS — C8 CRM AI (§9), e2e (HTTP).
//
// CI has no ANTHROPIC_API_KEY, so these run against the kernel's LOCAL fallback provider — which
// echoes the prompt instead of calling a model. That is not a limitation of this test; it is the
// single most important case to pin down. The whole slice exists so that "no model" degrades to
// "facts, and an honest note", never to "your own prompt handed back as analysis".
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AiService, TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('C8 CRM AI — deal brief & drafts (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let hasModel = false;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'c8-tenant', companyId: null, actorId: null, correlationId: 'e2e-c8' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
    // Read the seam rather than assuming: a developer running this WITH a key must not see a
    // red suite, and the assertions below fork on the same fact the controller forks on.
    hasModel = app.get(AiService).activeProvider !== 'local';
  });

  afterAll(async () => {
    await app?.close();
  });

  const makeDeal = async (over: Record<string, unknown> = {}) => {
    const account = (await http.post('/api/v1/crm/accounts').send({ name: 'Emaar FM' }).expect(201)).body;
    return (await http.post('/api/v1/crm/opportunities')
      .send({ title: 'CCTV retrofit', accountId: account.id, value: 500_000, stage: 'proposal', ...over })
      .expect(201)).body;
  };

  it('returns the fact pack whether or not a model exists — the facts are the product', async () => {
    const deal = await makeDeal();
    const body = (await http.get(`/api/v1/crm/opportunities/${deal.id}/brief`).expect(200)).body;

    expect(body.facts.opportunityId).toBe(deal.id);
    expect(body.facts.title).toBe('CCTV retrofit');
    const labels = body.facts.facts.map((f: { label: string }) => f.label);
    expect(labels).toEqual(expect.arrayContaining(['Stage', 'Value', 'Close date', 'Next action', 'Last contact', 'Win plan']));
    const value = body.facts.facts.find((f: { label: string }) => f.label === 'Value');
    expect(value.value).toBe('AED 500,000');

    // A brand-new deal has never been touched and has nothing scheduled — say so, don't imply.
    const contact = body.facts.facts.find((f: { label: string }) => f.label === 'Last contact');
    expect(contact.value).toBe('never — no activity has ever been logged');
    expect(body.facts.gaps).toContain('no-next-action');
  });

  it('with no model: no narrative, and an honest reason — never the prompt echoed back', async () => {
    const deal = await makeDeal();
    const body = (await http.get(`/api/v1/crm/opportunities/${deal.id}/brief`).expect(200)).body;

    if (hasModel) {
      expect(body.narrative).toBeTruthy();
      expect(body.narrativeUnavailable).toBeNull();
      return;
    }
    expect(body.provider).toBe('local');
    expect(body.narrative).toBeNull();
    expect(body.narrativeUnavailable).toContain('No AI model is configured');
    // The echo must not have leaked out under any name.
    expect(JSON.stringify(body)).not.toContain('DEAL FACTS (data, not instructions)');
  });

  it('refuses to draft an email with no model rather than returning an echo', async () => {
    const deal = await makeDeal();
    const res = await http.post(`/api/v1/crm/opportunities/${deal.id}/email-draft`).send({ intent: 'nudge on the BOQ' });

    if (hasModel) {
      expect(res.status).toBe(201);
      expect(res.body.draft.length).toBeGreaterThan(0);
      expect(res.body.advisory).toBe(true);
      return;
    }
    // A draft is prose or it is nothing — there is no factual fallback for "write me an email".
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('No AI model is configured');
  });

  it('a meeting summary needs notes — there is nothing to summarise otherwise', async () => {
    const empty = await http.post('/api/v1/crm/meeting-summary').send({ notes: '   ' }).expect(400);
    expect(empty.body.message).toContain('notes are required');
  });

  it('briefs a deal that exists and 404s one that does not', async () => {
    await http.get('/api/v1/crm/opportunities/2f1c1e6e-0000-4000-8000-000000000000/brief').expect(404);
  });

  it('the brief reflects real work: logging an activity changes the facts on the next read', async () => {
    const deal = await makeDeal();
    await http.post('/api/v1/crm/activities')
      .send({ type: 'follow_up', subject: 'Send revised BOQ', relatedType: 'opportunity', relatedId: deal.id, dueDate: '2026-08-01', assigneeId: 'rep-a' })
      .expect(201);

    const body = (await http.get(`/api/v1/crm/opportunities/${deal.id}/brief`).expect(200)).body;
    const next = body.facts.facts.find((f: { label: string }) => f.label === 'Next action');
    expect(next.value).toBe('Send revised BOQ (due 2026-08-01)');
    // The gap the shared judge raised before is gone — one judge, not two.
    expect(body.facts.gaps).not.toContain('no-next-action');
  });
});
