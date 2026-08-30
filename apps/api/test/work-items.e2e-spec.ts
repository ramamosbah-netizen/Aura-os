import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('My Work items (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((req: { headers: Record<string, string | undefined> }, _res: unknown, next: () => void) => tenant.run({
      tenantId: req.headers['x-test-tenant'] ?? 'work-tenant-a',
      companyId: null,
      actorId: req.headers['x-test-actor'] ?? null,
      correlationId: 'e2e-work-items',
    }, () => next()));
    const users = app.get(UsersService);
    for (const userId of ['user-a', 'user-b', 'user-task-owner', 'user-reminder-owner']) {
      users.save({ tenantId: 'work-tenant-a', userId, displayName: userId, active: true });
    }
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => { await app?.close(); });

  it('requires a user identity', async () => {
    await http.get('/api/v1/work-items').expect(401);
  });

  it('returns only the current user projection and denies another user quick actions', async () => {
    const project = (await http.post('/api/v1/projects/projects')
      .send({ title: 'ABC Project', value: 1000 })
      .expect(201)).body as { id: string };
    const activity = (await http.post('/api/v1/crm/activities')
      .set('x-test-actor', 'user-a')
      .send({ type: 'task', subject: 'Prepare CCTV inspection', relatedType: 'project', relatedId: project.id, relatedName: 'ABC Project', dueDate: '2026-08-17' })
      .expect(201)).body as { id: string };

    const mine = (await http.get('/api/v1/work-items').set('x-test-actor', 'user-a').expect(200)).body as { items: Array<{ sourceId: string; status: string; origin: string }> };
    expect(mine.items).toContainEqual(expect.objectContaining({ sourceId: activity.id, status: 'todo', origin: 'self' }));

    const anotherUser = (await http.get('/api/v1/work-items').set('x-test-actor', 'user-b').expect(200)).body as { items: Array<{ sourceId: string }> };
    expect(anotherUser.items.some((item) => item.sourceId === activity.id)).toBe(false);

    await http.post(`/api/v1/work-items/crm-activity/${activity.id}/complete`).set('x-test-actor', 'user-b').expect(403);
    const completed = (await http.post(`/api/v1/work-items/crm-activity/${activity.id}/complete`).set('x-test-actor', 'user-a').expect(201)).body as { status: string };
    expect(completed.status).toBe('done');
  });

  it('denies cross-tenant reads even when the actor id matches', async () => {
    const otherTenant = (await http.get('/api/v1/work-items')
      .set('x-test-actor', 'user-a')
      .set('x-test-tenant', 'work-tenant-b')
      .expect(200)).body as { items: Array<{ title: string }> };
    expect(otherTenant.items.some((item) => item.title === 'Prepare CCTV inspection')).toBe(false);
  });

  it('creates, edits, reschedules with a reason, and safely removes a personal task', async () => {
    const created = (await http.post('/api/v1/work-items')
      .set('x-test-actor', 'user-task-owner')
      .send({ title: 'Coordinate access control test', memo: 'Initial memo', dueAt: '2026-08-18', reminderAt: '2026-08-17T09:00:00.000Z', recurrence: 'weekly', recurrenceEndsOn: '2026-09-30' })
      .expect(201)).body as { source: string; sourceId: string; title: string; memo: string; dueAt: string };

    expect(created).toMatchObject({ source: 'crm-activity', title: 'Coordinate access control test', memo: 'Initial memo', dueAt: '2026-08-18', reminderAt: '2026-08-17T09:00:00.000Z', recurrence: 'weekly', recurrenceEndsOn: '2026-09-30' });

    const edited = (await http.patch(`/api/v1/work-items/${created.source}/${created.sourceId}`)
      .set('x-test-actor', 'user-task-owner')
      .send({ title: 'Coordinate access control witness test', memo: 'Bring approved method statement' })
      .expect(200)).body as { title: string; memo: string };
    expect(edited).toMatchObject({ title: 'Coordinate access control witness test', memo: 'Bring approved method statement' });

    await http.post(`/api/v1/work-items/${created.source}/${created.sourceId}/reschedule`)
      .set('x-test-actor', 'user-task-owner')
      .send({ dueAt: '2026-08-20' })
      .expect(400);

    const rescheduled = (await http.post(`/api/v1/work-items/${created.source}/${created.sourceId}/reschedule`)
      .set('x-test-actor', 'user-task-owner')
      .send({ dueAt: '2026-08-20', reason: 'Client witness moved to Thursday' })
      .expect(201)).body as { dueAt: string; memo: string };
    expect(rescheduled.dueAt).toBe('2026-08-20');
    expect(rescheduled.memo).toContain('Client witness moved to Thursday');

    await http.patch(`/api/v1/work-items/${created.source}/${created.sourceId}`)
      .set('x-test-actor', 'another-user')
      .send({ title: 'Unauthorized change' })
      .expect(403);

    await http.delete(`/api/v1/work-items/${created.source}/${created.sourceId}`)
      .set('x-test-actor', 'user-task-owner')
      .expect(200);

    const afterDelete = (await http.get('/api/v1/work-items')
      .set('x-test-actor', 'user-task-owner')
      .expect(200)).body as { items: Array<{ sourceId: string }> };
    expect(afterDelete.items.some((item) => item.sourceId === created.sourceId)).toBe(false);
  });

  it('dispatches a due reminder once to the user notification center', async () => {
    const created = (await http.post('/api/v1/work-items')
      .set('x-test-actor', 'user-reminder-owner')
      .send({ title: 'Reminder delivery verification', dueAt: '2026-08-16', reminderAt: '2026-01-01T08:00:00.000Z' })
      .expect(201)).body as { source: string; sourceId: string };

    const first = (await http.post('/api/v1/work-items/reminders/sync')
      .set('x-test-actor', 'user-reminder-owner')
      .expect(201)).body as { dispatched: number };
    expect(first.dispatched).toBeGreaterThanOrEqual(1);

    const second = (await http.post('/api/v1/work-items/reminders/sync')
      .set('x-test-actor', 'user-reminder-owner')
      .expect(201)).body as { dispatched: number };
    expect(second.dispatched).toBe(0);

    await http.delete(`/api/v1/work-items/${created.source}/${created.sourceId}`)
      .set('x-test-actor', 'user-reminder-owner')
      .expect(200);
  });
});
