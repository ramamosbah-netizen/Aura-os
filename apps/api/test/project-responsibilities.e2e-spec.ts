import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('Project delivery responsibilities (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;
  let otherProjectId: string;
  let responsibilityId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((req: { headers: Record<string, string | undefined> }, _res: unknown, next: () => void) => tenant.run({
      tenantId: 'responsibility-tenant', companyId: null, actorId: req.headers['x-test-actor'] ?? 'manager', correlationId: 'responsibility-e2e',
    }, () => next()));
    const users = app.get(UsersService);
    for (const userId of ['manager', 'engineer', 'reader', 'outsider']) users.save({ tenantId: 'responsibility-tenant', userId, displayName: userId, active: true });
    await app.init();
    const access = app.get(AccessService);
    access.grant({ userId: 'manager', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: 'responsibility-tenant' } });
    http = request(app.getHttpServer());

    projectId = (await http.post('/api/v1/projects/projects').send({ title: 'Responsibility project' }).expect(201)).body.id;
    otherProjectId = (await http.post('/api/v1/projects/projects').send({ title: 'Another project' }).expect(201)).body.id;
    await http.post(`/api/v1/projects/${projectId}/members`).send({ userId: 'manager', roleId: 'r-pm' }).expect(201);
    await http.post(`/api/v1/projects/${projectId}/members`).send({ userId: 'engineer', roleId: 'r-technical-engineer' }).expect(201);
    access.grant({ userId: 'reader', roleId: 'r-client', scope: { kind: 'resource', resourceType: 'project', resourceId: projectId } });
  });

  afterAll(async () => { await app?.close(); });

  it('assigns canonical project work and makes it arrive in the assignee My Work queue', async () => {
    const response = await http.post(`/api/v1/projects/${projectId}/responsibilities`)
      .set('x-test-actor', 'manager')
      .send({ workstream: 'engineering_release', title: 'Release approved drawings', assigneeId: 'engineer', dueDate: '2026-09-20' })
      .expect(201);
    responsibilityId = response.body.id;
    expect(response.body).toMatchObject({ projectId, assigneeId: 'engineer', assigneeName: 'engineer', status: 'assigned', canAct: false });

    const mine = (await http.get('/api/v1/work-items').set('x-test-actor', 'engineer').expect(200)).body;
    expect(mine.items).toContainEqual(expect.objectContaining({ source: 'project-responsibility', sourceId: responsibilityId, projectId, actions: ['start'] }));
  });

  it('denies the wrong actor, wrong project and membership without functional permission', async () => {
    await http.post(`/api/v1/projects/${projectId}/responsibilities/${responsibilityId}/accept`).set('x-test-actor', 'manager').expect(403);
    await http.post(`/api/v1/projects/${otherProjectId}/responsibilities/${responsibilityId}/accept`).set('x-test-actor', 'engineer').expect(400);

    const reader = (await http.post(`/api/v1/projects/${projectId}/responsibilities`)
      .set('x-test-actor', 'manager')
      .send({ workstream: 'handover', title: 'Compile dossier', assigneeId: 'reader' })
      .expect(201)).body;
    await http.post(`/api/v1/projects/${projectId}/responsibilities/${reader.id}/start`).set('x-test-actor', 'reader').expect(403);
    await http.post(`/api/v1/projects/${projectId}/responsibilities`)
      .set('x-test-actor', 'manager')
      .send({ workstream: 'planning', title: 'Publish baseline', assigneeId: 'outsider' })
      .expect(400);
  });

  it('requires the canonical delivery owner for a construction drawing and exposes its exact release in My Work', async () => {
    await http.post(`/api/v1/projects/${otherProjectId}/members`)
      .set('x-test-actor', 'manager')
      .send({ userId: 'engineer', roleId: 'r-technical-engineer' })
      .expect(201);
    const wrongProjectResponsibility = (await http.post(`/api/v1/projects/${otherProjectId}/responsibilities`)
      .set('x-test-actor', 'manager')
      .send({ workstream: 'engineering_release', title: 'Other project release', assigneeId: 'engineer' })
      .expect(201)).body;
    const releaseResponsibility = (await http.post(`/api/v1/projects/${projectId}/responsibilities`)
      .set('x-test-actor', 'manager')
      .send({ workstream: 'engineering_release', title: 'Receive CCTV construction issue', assigneeId: 'engineer' })
      .expect(201)).body;

    const drawing = (await http.post('/api/v1/engineering/drawings')
      .set('x-test-actor', 'manager')
      .send({ projectId, code: 'ELV-CCTV-IFC-001', title: 'CCTV construction layout' })
      .expect(201)).body;
    await http.post(`/api/v1/engineering/drawings/${drawing.id}/submit`).set('x-test-actor', 'manager').send({ purpose: 'For Approval' }).expect(201);
    await http.post(`/api/v1/engineering/drawings/${drawing.id}/start-review`).set('x-test-actor', 'manager').send({}).expect(201);
    await http.post(`/api/v1/engineering/drawings/${drawing.id}/review`).set('x-test-actor', 'manager').send({ outcome: 'approved' }).expect(201);

    await http.post(`/api/v1/engineering/drawings/${drawing.id}/transmit`)
      .set('x-test-actor', 'manager')
      .send({ recipient: 'Site team', purpose: 'For Construction' })
      .expect(400, /engineering release responsibility is required/);
    await http.post(`/api/v1/engineering/drawings/${drawing.id}/transmit`)
      .set('x-test-actor', 'manager')
      .send({ recipient: 'Site team', purpose: 'For Construction', responsibilityId: wrongProjectResponsibility.id })
      .expect(400, /drawing project/);
    await http.post(`/api/v1/engineering/drawings/${drawing.id}/transmit`)
      .set('x-test-actor', 'manager')
      .send({ recipient: 'Site team', purpose: 'For Construction', responsibilityId: releaseResponsibility.id })
      .expect(201);

    const history = (await http.get(`/api/v1/projects/${projectId}/responsibilities`).set('x-test-actor', 'manager').expect(200)).body;
    expect(history).toContainEqual(expect.objectContaining({
      id: releaseResponsibility.id,
      sourceType: 'engineering.drawing',
      sourceId: drawing.id,
      sourceReference: 'ELV-CCTV-IFC-001',
      sourceRevision: '0',
      transmittalRef: expect.stringMatching(/^TR-/),
    }));

    const mine = (await http.get('/api/v1/work-items').set('x-test-actor', 'engineer').expect(200)).body;
    expect(mine.items).toContainEqual(expect.objectContaining({
      source: 'project-responsibility',
      sourceId: releaseResponsibility.id,
      projectId,
      href: `/project/${projectId}/drawings/${drawing.id}`,
      detail: expect.stringMatching(/ELV-CCTV-IFC-001 Rev 0 · TR-/),
      actions: ['start'],
    }));
  });

  it('records acceptance, start and completion and removes completed work from the active queue', async () => {
    await http.post(`/api/v1/projects/${projectId}/responsibilities/${responsibilityId}/accept`).set('x-test-actor', 'engineer').expect(201, /accepted/);
    await http.post(`/api/v1/projects/${projectId}/responsibilities/${responsibilityId}/start`).set('x-test-actor', 'engineer').expect(201, /in_progress/);
    const completed = await http.post(`/api/v1/projects/${projectId}/responsibilities/${responsibilityId}/complete`).set('x-test-actor', 'engineer').expect(201);
    expect(completed.body).toMatchObject({ status: 'completed', canAct: true });
    const mine = (await http.get('/api/v1/work-items').set('x-test-actor', 'engineer').expect(200)).body;
    expect(mine.items.some((item: { sourceId: string }) => item.sourceId === responsibilityId)).toBe(false);
    const history = (await http.get(`/api/v1/projects/${projectId}/responsibilities`).set('x-test-actor', 'manager').expect(200)).body;
    expect(history).toContainEqual(expect.objectContaining({ id: responsibilityId, status: 'completed' }));
  });
});
