// AURA OS — C7 CRM automation (§8), e2e (HTTP).
//
// The sweep over the wire: it routes what it can prove, escalates what a human must know, and —
// the part that decides whether anyone leaves it switched on — does not repeat itself.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('C7 CRM automation (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'c7-tenant', companyId: null, actorId: null, correlationId: 'e2e-c7' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const sweep = async (windowHours?: number) =>
    (await http.post(`/api/v1/crm/automation/run${windowHours ? `?windowHours=${windowHours}` : ''}`).expect(201)).body;

  it('routes an unassigned lead to the owner of the account it matches — and only that lead', async () => {
    // The create route forces ownerId to the acting user and ignores the body — so the owner is
    // set by PATCH, which is the same path a human uses to hand an account over.
    const created = (await http.post('/api/v1/crm/accounts').send({ name: 'Meraas Holding' }).expect(201)).body;
    const account = (await http.patch(`/api/v1/crm/accounts/${created.id}`).send({ ownerId: 'rep-owner' }).expect(200)).body;
    expect(account.ownerId).toBe('rep-owner');

    const known = (await http.post('/api/v1/crm/leads')
      .send({ name: 'Known Buyer', companyName: 'Meraas Holding' })
      .expect(201)).body;
    const stranger = (await http.post('/api/v1/crm/leads')
      .send({ name: 'Cold Caller', companyName: 'Nobody We Have Ever Met LLC' })
      .expect(201)).body;

    expect(known.assignedTo).toBeNull();

    const run = await sweep();
    const routed = run.assignments.find((a: { leadId: string }) => a.leadId === known.id);
    expect(routed).toMatchObject({ assigneeId: 'rep-owner', accountName: 'Meraas Holding' });
    expect(run.applied.assignments).toBeGreaterThanOrEqual(1);
    expect(run.applied.failures).toBe(0);

    // The write really happened, through the normal assign path.
    const after = (await http.get(`/api/v1/crm/leads/${known.id}`).expect(200)).body;
    expect(after.assignedTo).toBe('rep-owner');
    expect(after.assignedAt).not.toBeNull();

    // The stranger keeps its empty seat — a wrong owner is worse than none.
    const strangerAfter = (await http.get(`/api/v1/crm/leads/${stranger.id}`).expect(200)).body;
    expect(strangerAfter.assignedTo).toBeNull();
  });

  it('is idempotent on routing — a second sweep re-routes nothing', async () => {
    const first = await sweep();
    const second = await sweep();
    // Everything routable was routed by the first run; nothing is unassigned-and-matching now.
    expect(second.assignments).toEqual([]);
    expect(first.windowHours).toBe(24);
  });

  it('escalates an overdue follow-up once, not on every sweep', async () => {
    const account = (await http.post('/api/v1/crm/accounts').send({ name: 'Escalation Co' }).expect(201)).body;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const longAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const fresh = (await http.post('/api/v1/crm/activities')
      .send({ type: 'follow_up', subject: 'Chase the drawings', relatedType: 'account', relatedId: account.id, dueDate: yesterday, assigneeId: 'rep-a' })
      .expect(201)).body;
    const stale = (await http.post('/api/v1/crm/activities')
      .send({ type: 'follow_up', subject: 'Ancient forgotten task', relatedType: 'account', relatedId: account.id, dueDate: longAgo, assigneeId: 'rep-a' })
      .expect(201)).body;

    const run = await sweep(24);
    const overdue = run.escalations.filter((e: { kind: string }) => e.kind === 'FOLLOW_UP_OVERDUE');
    const ids = overdue.map((e: { refId: string }) => e.refId);

    // Went overdue yesterday — inside the declared 24h cadence, so it is news.
    expect(ids).toContain(fresh.id);
    // Overdue for a month — already escalated 29 sweeps ago. Repeating it is how alerts get muted.
    expect(ids).not.toContain(stale.id);

    // Notifications were actually raised for what it found.
    expect(run.applied.notifications).toBe(run.escalations.length);
    expect(run.applied.failures).toBe(0);
  });

  it('a wider window is the caller declaring a slower cadence, and catches the older one', async () => {
    const run = await sweep(24 * 30);
    const subjects = run.escalations.map((e: { title: string }) => e.title);
    expect(subjects.some((t: string) => t.includes('Ancient forgotten task'))).toBe(true);
    expect(run.windowHours).toBe(24 * 30);
  });

  it('clamps a junk or absurd window rather than silently sweeping all of history', async () => {
    expect((await sweep()).windowHours).toBe(24);
    const junk = (await http.post('/api/v1/crm/automation/run?windowHours=banana').expect(201)).body;
    expect(junk.windowHours).toBe(24);
    const huge = (await http.post('/api/v1/crm/automation/run?windowHours=999999').expect(201)).body;
    expect(huge.windowHours).toBe(24 * 30);
  });
});
