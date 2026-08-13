// AURA OS — Project Delivery membership, e2e (HTTP). Project Delivery Workspace spec, slice P1.
//
// Membership is an access grant scoped to `resource:project:<id>`:
//   add a delivery-role member → it appears on THAT project only (not another) → remove it.
// Also proves the delivery-role whitelist blocks enterprise-role escalation (r-admin → 400).
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TenantContext } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

describe('Project Delivery — membership (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: 'pm-e2e', companyId: null, actorId: 'u-admin', correlationId: 'e2e-pm' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const PA = '/api/v1/projects/proj-A';
  const PB = '/api/v1/projects/proj-B';

  it('assigns delivery-role members per project, isolates them, and blocks enterprise-role escalation', async () => {
    // The assignable catalog offers ONLY the four delivery roles.
    const cat = await http.get(`${PA}/assignable`).expect(200);
    const roleIds = (cat.body.roles as Array<{ id: string }>).map((r) => r.id).sort();
    expect(roleIds).toEqual(['r-hse', 'r-pm', 'r-qa-qc', 'r-site-engineer']);

    // Add a Site Engineer to project A.
    const added = await http.post(`${PA}/members`).send({ userId: 'u-eng-1', roleId: 'r-site-engineer' }).expect(201);
    expect(added.body.member).toMatchObject({ userId: 'u-eng-1', roleId: 'r-site-engineer', roleName: 'Site Engineer' });

    // It shows on project A…
    const aMembers = await http.get(`${PA}/members`).expect(200);
    expect(aMembers.body).toHaveLength(1);
    expect(aMembers.body[0]).toMatchObject({ userId: 'u-eng-1', roleId: 'r-site-engineer' });

    // …and NOT on project B — the grant is scoped to one project, so membership does not leak.
    const bMembers = await http.get(`${PB}/members`).expect(200);
    expect(bMembers.body).toHaveLength(0);

    // An enterprise role can never be assigned through the project team screen.
    await http.post(`${PA}/members`).send({ userId: 'u-eng-1', roleId: 'r-admin' }).expect(400);

    // Remove the member (revoke the project-scoped grant).
    const removed = await http.delete(`${PA}/members/u-eng-1?roleId=r-site-engineer`).expect(200);
    expect(removed.body).toEqual({ removed: true });

    const after = await http.get(`${PA}/members`).expect(200);
    expect(after.body).toHaveLength(0);
  });
});
