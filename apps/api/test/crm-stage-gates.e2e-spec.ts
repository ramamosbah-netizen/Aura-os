// AURA OS — G5 commercial stage gates + Won/Lost invariants, e2e (HTTP).
//
// Until now any stage dragged to any stage: a deal could reach `proposal` with nobody to propose
// to, or be marked `won` with no value and no reason — and the pipeline reported it as fact.
//
// This spec registers AllExceptionsFilter deliberately. Without it a domain guard escapes as a
// 500 and the spec would assert the wrong contract — the trap that hid the quotation pricing lock,
// and the reason the older CRM specs report these refusals as 500s.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('G5 stage gates (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'sg-tenant', companyId: null, actorId: null, correlationId: 'e2e-sg' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  /** A deal with an account and a named contact — i.e. someone to actually propose to. */
  const dealWithContact = async (title: string, over: Record<string, unknown> = {}): Promise<{ id: string }> => {
    const account = (await http.post('/api/v1/crm/accounts').send({ name: `${title} Client` }).expect(201)).body;
    await http.post('/api/v1/crm/contacts').send({ name: 'Buyer Person', accountId: account.id }).expect(201);
    return (
      await http.post('/api/v1/crm/opportunities').send({
        title, value: 500_000, accountId: account.id, accountName: account.name, ...over,
      }).expect(201)
    ).body;
  };

  const move = async (id: string, body: Record<string, unknown>): Promise<request.Response> =>
    http.patch(`/api/v1/crm/opportunities/${id}`).send(body);

  // ── the gate refuses, and refuses as a CONFLICT ────────────────────────────────────────────────
  it('→ proposal is refused when the need is unconfirmed and nobody is mapped', async () => {
    const bare = (await http.post('/api/v1/crm/opportunities').send({ title: 'Nobody', value: 100 }).expect(201)).body;
    const res = await move(bare.id, { stage: 'proposal' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Confirm the need/i);
    expect(res.body.message).toMatch(/cannot propose to nobody/i);
  });

  it('a blocked transition is a CONFLICT, not a validation error', async () => {
    // A stage gate is a state-transition guard: the request is well-formed, the aggregate's state
    // forbids it. Mis-classifying it 400 would tell the client to fix its payload instead.
    const bare = (await http.post('/api/v1/crm/opportunities').send({ title: 'Classify', value: 100 }).expect(201)).body;
    const res = await move(bare.id, { stage: 'proposal' });
    expect(res.body.code).toBe('CONFLICT');
  });

  it('→ proposal is allowed once the need is confirmed and a contact exists', async () => {
    const opp = await dealWithContact('Proposable', { needConfirmed: true });
    await move(opp.id, { stage: 'proposal' }).then((r) => expect(r.status).toBe(200));
  });

  it('→ negotiation needs a proposal that was actually SENT, not merely drafted', async () => {
    const opp = await dealWithContact('Negotiable', { needConfirmed: true });
    await move(opp.id, { stage: 'proposal' }).then((r) => expect(r.status).toBe(200));

    const noQuote = await move(opp.id, { stage: 'negotiation' });
    expect(noQuote.status).toBe(409);
    expect(noQuote.body.message).toMatch(/nothing to negotiate/i);

    // A draft quotation is not a proposal.
    const quote = (
      await http.post('/api/v1/crm/quotations').send({
        quoteNumber: `QT-SG-${Date.now()}`, customerName: 'Negotiable Client', issueDate: '2026-07-15',
        sourceOpportunityId: opp.id, lines: [{ description: 'CCTV', quantity: 1, unitPrice: 500_000, vatRate: 5 }],
      }).expect(201)
    ).body;
    const drafted = await move(opp.id, { stage: 'negotiation' });
    expect(drafted.status).toBe(409);
    expect(drafted.body.message).toMatch(/a draft is not a proposal/i);

    // Approve + send it, and the gate opens.
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'approve' }).expect(200);
    await http.patch(`/api/v1/crm/quotations/${quote.id}/status`).send({ action: 'send' }).expect(200);
    await move(opp.id, { stage: 'negotiation' }).then((r) => expect(r.status).toBe(200));
  });

  // ── invariant 3: Won → final value + winning context ───────────────────────────────────────────
  it('→ won is refused with no value and no reason', async () => {
    const opp = await dealWithContact('Zero win', { value: 0, needConfirmed: true });
    const res = await move(opp.id, { stage: 'won' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/win of 0 is not a win/i);
    expect(res.body.message).toMatch(/why we won/i);
  });

  it('→ won succeeds when the stage and the winning reason arrive in ONE patch', async () => {
    // The natural way to close a deal — the gate reads the post-patch record so this works.
    const opp = await dealWithContact('Real win');
    const res = await move(opp.id, { stage: 'won', winReason: 'Best technical fit' });
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('won');
    expect(res.body.winReason).toBe('Best technical fit');
  });

  // ── invariant 4: Lost → reason ─────────────────────────────────────────────────────────────────
  it('→ lost is refused without a reason — the most valuable field in the CRM', async () => {
    const opp = await dealWithContact('Silent loss');
    const res = await move(opp.id, { stage: 'lost' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/why we lost/i);
  });

  it('→ lost succeeds with a reason, and does not demand a value', async () => {
    const opp = await dealWithContact('Explained loss', { value: 0 });
    const res = await move(opp.id, { stage: 'lost', lossReason: 'Price — 12% above the incumbent' });
    expect(res.status).toBe(200);
    expect(res.body.lossReason).toBe('Price — 12% above the incumbent');
  });

  // ── what must keep working ─────────────────────────────────────────────────────────────────────
  it('moving BACKWARD is never gated — deals genuinely regress', async () => {
    const opp = await dealWithContact('Regressing', { needConfirmed: true });
    await move(opp.id, { stage: 'proposal' }).then((r) => expect(r.status).toBe(200));
    // Punishing honesty about a regression is how a pipeline becomes fiction.
    await move(opp.id, { stage: 'qualification' }).then((r) => expect(r.status).toBe(200));
  });

  it('an ordinary PATCH that does not touch the stage is never gated', async () => {
    const opp = await dealWithContact('Editable');
    await move(opp.id, { nextAction: 'Call the consultant', value: 600_000 }).then((r) => expect(r.status).toBe(200));
  });

  it('deals already sitting in won are not retro-blocked by the new rule', async () => {
    // The gate applies to TRANSITIONS. History is not rewritten to pretend it explained itself.
    const opp = await dealWithContact('Historic', { stage: 'won' });
    expect(opp).toMatchObject({ stage: 'won' });
    await move(opp.id, { nextAction: 'Handover' }).then((r) => expect(r.status).toBe(200));
  });
});
