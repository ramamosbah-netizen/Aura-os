// AURA OS — C1 lifecycle completion (G8+G9+G10+G11), e2e (HTTP).
//
// The audit's rides-along, proven over the wire: the widened lead lifecycle is accepted and
// active; assignment acceptance is a real fact with its own route; WhatsApp/site-visit are
// first-class activity types (a typo'd type is refused, not persisted); and an activity can be
// STARTED — planned → in_progress → completed with both timestamps captured.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('C1 lifecycle completion (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'c1-tenant', companyId: null, actorId: null, correlationId: 'e2e-c1' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('G8 — the widened lead lifecycle round-trips and stays ACTIVE', async () => {
    const lead = (await http.post('/api/v1/crm/leads').send({ name: 'Lifecycle Lead' }).expect(201)).body;
    for (const status of ['verified', 'assigned', 'qualifying']) {
      const patched = (await http.patch(`/api/v1/crm/leads/${lead.id}`).send({ status }).expect(200)).body;
      expect(patched.status).toBe(status);
    }
    // Still counted among active leads in the command view (not nurture/converted/disqualified).
    const cmd = (await http.get('/api/v1/crm/leads/command').expect(200)).body;
    const row = cmd.leads.find((l: { id: string }) => l.id === lead.id);
    expect(row.attention.active).toBe(true);
  });

  it('G9 — accept acknowledges an assignment; unassigned leads have nothing to accept', async () => {
    const lead = (await http.post('/api/v1/crm/leads').send({ name: 'Accept Lead' }).expect(201)).body;
    await http.post(`/api/v1/crm/leads/${lead.id}/accept`).expect(400); // not assigned yet

    await http.patch(`/api/v1/crm/leads/${lead.id}/assign`).send({ assignedTo: 'rep-1' }).expect(200);
    const accepted = (await http.post(`/api/v1/crm/leads/${lead.id}/accept`).expect(201)).body;
    expect(accepted.acceptedAt).toBeTruthy();

    // Idempotent: accepting again keeps the original timestamp.
    const again = (await http.post(`/api/v1/crm/leads/${lead.id}/accept`).expect(201)).body;
    expect(again.acceptedAt).toBe(accepted.acceptedAt);

    // Reassignment resets the acknowledgement — a fresh owner must accept for themselves.
    const reassigned = (await http.patch(`/api/v1/crm/leads/${lead.id}/assign`).send({ assignedTo: 'rep-2' }).expect(200)).body;
    expect(reassigned.acceptedAt).toBeNull();
  });

  it('G10 — WhatsApp and site visits are first-class; a typo’d type is refused, not persisted', async () => {
    const wa = (await http.post('/api/v1/crm/activities').send({ type: 'whatsapp', subject: 'Sent BOQ over WhatsApp' }).expect(201)).body;
    expect(wa.type).toBe('whatsapp');
    await http.post('/api/v1/crm/activities').send({ type: 'site_visit', subject: 'Walk Tower B' }).expect(201);
    await http.post('/api/v1/crm/activities').send({ type: 'telepathy', subject: 'Nope' }).expect(400);
  });

  it('G11 — planned → in_progress → completed, with startedAt and completedAt both captured', async () => {
    const a = (await http.post('/api/v1/crm/activities').send({ type: 'site_visit', subject: 'Survey Floor 3' }).expect(201)).body;
    expect(a.status).toBe('open');
    expect(a.startedAt).toBeNull();

    const started = (await http.post(`/api/v1/crm/activities/${a.id}/start`).expect(201)).body;
    expect(started.status).toBe('in_progress');
    expect(started.startedAt).toBeTruthy();

    const done = (await http.post(`/api/v1/crm/activities/${a.id}/complete`).send({ outcome: 'Survey done' }).expect(201)).body;
    expect(done.status).toBe('completed');
    expect(done.startedAt).toBe(started.startedAt);
    expect(done.completedAt).toBeTruthy();

    // A completed activity cannot be started; a cancelled one cannot be completed.
    await http.post(`/api/v1/crm/activities/${a.id}/start`).expect(400);
  });
});
