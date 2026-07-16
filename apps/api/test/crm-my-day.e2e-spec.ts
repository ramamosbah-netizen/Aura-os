// AURA OS — C4 Sales Workspace "My Day", e2e (HTTP).
//
// The page over the wire: work created in the three systems shows up on the right desk, in the
// right bucket, and on nobody else's day. Nothing is stored for this view — the day is composed
// per read, so completing a task changes it immediately.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('C4 my day (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      // actorId stays null (the system actor every other e2e uses — a named actor with no roles is
      // denied by the kernel). "My" day is therefore asked for explicitly here; the caller-default
      // and its refusal-when-nobody path are asserted below.
      tenant.run({ tenantId: 'c4-tenant', companyId: null, actorId: null, correlationId: 'e2e-c4' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const day = (n: number): string => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const today = day(0);

  it('composes one rep\'s day from activities, leads and deals — and keeps it off everyone else\'s', async () => {
    const account = (await http.post('/api/v1/crm/accounts').send({ name: 'Palm Residences' }).expect(201)).body;

    const mine = (await http.post('/api/v1/crm/opportunities')
      .send({ title: 'Fire alarm upgrade', accountId: account.id, value: 480_000, stage: 'proposal', ownerId: 'rep-a' })
      .expect(201)).body;
    const theirs = (await http.post('/api/v1/crm/opportunities')
      .send({ title: 'Someone else\'s deal', accountId: account.id, value: 900_000, stage: 'proposal', ownerId: 'rep-b' })
      .expect(201)).body;

    // A meeting today, a late task, and a colleague's task on my deal.
    await http.post('/api/v1/crm/activities')
      .send({ type: 'site_visit', subject: 'Site walk with FM', relatedType: 'opportunity', relatedId: mine.id, dueDate: today, assigneeId: 'rep-a' })
      .expect(201);
    await http.post('/api/v1/crm/activities')
      .send({ type: 'task', subject: 'Chase the BOQ', relatedType: 'opportunity', relatedId: mine.id, dueDate: day(-3), assigneeId: 'rep-a' })
      .expect(201);
    await http.post('/api/v1/crm/activities')
      .send({ type: 'call', subject: 'Not my call', relatedType: 'opportunity', relatedId: theirs.id, dueDate: today, assigneeId: 'rep-b' })
      .expect(201);

    const d = (await http.get('/api/v1/crm/my-day?userId=rep-a').expect(200)).body;

    expect(d.userId).toBe('rep-a');
    expect(d.date).toBe(today);
    expect(d.meetings.map((t: { subject: string }) => t.subject)).toEqual(['Site walk with FM']);
    // Late first, then today.
    expect(d.now.map((t: { subject: string }) => t.subject)).toEqual(['Chase the BOQ', 'Site walk with FM']);
    expect(d.counts).toMatchObject({ overdue: 1, today: 1, meetingsToday: 1 });
    // rep-b's call never lands on rep-a's desk, and rep-b's deal is not rep-a's problem.
    const subjects = [...d.now, ...d.next].map((t: { subject: string }) => t.subject);
    expect(subjects).not.toContain('Not my call');
    expect(d.opportunities.map((o: { id: string }) => o.id)).not.toContain(theirs.id);

    // My deal's next action IS the earliest open activity — and that one is 3 days late, so the
    // deal is flagged. One fact, two places: the task on my desk and the deal it is holding up.
    const flaggedMine = d.opportunities.find((o: { id: string }) => o.id === mine.id);
    expect(flaggedMine.gaps).toEqual(['overdue']);
    expect(flaggedMine.nextAction).toBe('Chase the BOQ');

    // The same page for rep-b, asked for explicitly, is rep-b's — not rep-a's.
    const other = (await http.get('/api/v1/crm/my-day?userId=rep-b').expect(200)).body;
    expect(other.userId).toBe('rep-b');
    expect(other.now.map((t: { subject: string }) => t.subject)).toEqual(['Not my call']);
    // rep-b's deal is not flagged: its next action is that call, scheduled for today. Same engine,
    // same verdict — the two reps just see the halves that are theirs.
    expect(other.opportunities).toEqual([]);
    expect(other.counts).toMatchObject({ overdue: 0, today: 1 });
  });

  it('a deal with no next action shows up, and completing the work re-shapes the day on the next read', async () => {
    const naked = (await http.post('/api/v1/crm/opportunities')
      .send({ title: 'CCTV expansion', value: 120_000, stage: 'qualification', ownerId: 'rep-a' })
      .expect(201)).body;

    const before = (await http.get('/api/v1/crm/my-day?userId=rep-a').expect(200)).body;
    const flagged = before.opportunities.find((o: { id: string }) => o.id === naked.id);
    expect(flagged.gaps).toContain('no-next-action');

    // Schedule the next step — the deal leaves the "needs a next step" list. Same fact, one system.
    const act = (await http.post('/api/v1/crm/activities')
      .send({ type: 'follow_up', subject: 'Agree camera count', relatedType: 'opportunity', relatedId: naked.id, dueDate: day(2), assigneeId: 'rep-a' })
      .expect(201)).body;

    const after = (await http.get('/api/v1/crm/my-day?userId=rep-a').expect(200)).body;
    expect(after.opportunities.map((o: { id: string }) => o.id)).not.toContain(naked.id);
    expect(after.next.map((t: { id: string }) => t.id)).toContain(act.id);

    // Completing it takes it off the desk entirely — nothing was stored, so nothing goes stale.
    await http.post(`/api/v1/crm/activities/${act.id}/complete`).send({ outcome: '12 cameras agreed' }).expect(201);
    const done = (await http.get('/api/v1/crm/my-day?userId=rep-a').expect(200)).body;
    expect(done.next.map((t: { id: string }) => t.id)).not.toContain(act.id);
  });

  it('refuses to build a day for nobody rather than serving the unassigned work of the org', async () => {
    // No actor bound and no ?userId: a null "who" would match every unassigned record instead of
    // matching nobody. Refusing is the only honest answer.
    await http.get('/api/v1/crm/my-day').expect(400);
  });
});
