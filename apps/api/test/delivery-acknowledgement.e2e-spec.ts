import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * `BUY-07` — the next-role receipt, Auth-ON, JWT on.
 *
 * Material was issued by a Storekeeper and the movement is persisted. This is the other half of the
 * handoff: a named person at Site accepts receipt of it.
 *
 * TWO PROPERTIES ARE LOAD-BEARING AND BOTH ARE TESTED HOSTILELY.
 *
 *   THE RECEIPT WRITES NO QUANTITY. What was delivered is derived from the movements and has ONE
 *   authority. Every assertion below re-reads the delivered quantity after acknowledging and proves
 *   it did not move — a receipt that changed it would be a second writer of that number, which is
 *   the competing-truth defect this wave exists to remove.
 *
 *   NO RECIPIENT AUTHORITY IS AN UNKNOWN, NOT AN OPEN DOOR. Where nobody holds site execution for a
 *   package, the handoff refuses — it never falls back to the project-wide assignee, and never to
 *   whoever happens to hold a site role.
 */

const TENANT = `wp-ack-${Date.now()}`;

describe('Site acknowledges material delivered to a work package (JWT ON)', () => {
  let app: INestApplication;
  let store: ReturnType<typeof request.agent>;
  let site: ReturnType<typeof request.agent>;
  let other: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'wp-ack-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    access.registerRole({
      id: 'r-e2e-ack-store', name: 'Storekeeper (e2e)',
      permissions: ['inventory.*', 'projects.project.read', 'projects.*.read'],
    });
    access.registerRole({
      id: 'r-e2e-ack-site', name: 'Site engineer (e2e)',
      permissions: ['inventory.*', 'projects.project.read', 'projects.*.read'],
    });
    for (const userId of ['ack-store', 'ack-site', 'ack-other']) {
      const roleId = userId === 'ack-store' ? 'r-e2e-ack-store' : 'r-e2e-ack-site';
      access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: TENANT } });
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }
    access.grant({ userId: 'ack-admin', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 10_000_000 });
    users.save({ tenantId: TENANT, userId: 'ack-admin', displayName: 'ack-admin', active: true });

    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    expect(auth.enabled).toBe(true);

    const server = app.getHttpServer();
    const agent = (sub: string) => request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub, tenantId: TENANT })}`);
    store = agent('ack-store');
    site = agent('ack-site');
    other = agent('ack-other');
    admin = agent('ack-admin');
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  /**
   * A project, a work package, stock, and 40 m issued to that package by the Storekeeper.
   * `recipient` decides whether anybody owns site execution for the package.
   */
  async function scene(opts: { recipient?: string | null } = {}) {
    const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const project = (await admin.post('/api/v1/projects/projects').send({ title: `Ack job ${run}` }).expect(201)).body;

    // Membership: the responsibility service refuses an assignee who is not on the project.
    for (const userId of ['ack-site', 'ack-other', 'ack-store']) {
      await admin.post(`/api/v1/projects/${project.id}/members`)
        .send({ userId, roleId: 'r-site-engineer' }).catch(() => undefined);
    }

    const wbs = (await admin.post('/api/v1/projects/wbs')
      .send({ projectId: project.id, code: `2.1-${run}`, title: 'Riser mains' }).expect(201)).body;

    const recipient = opts.recipient === undefined ? 'ack-site' : opts.recipient;
    if (recipient) {
      await admin.post(`/api/v1/projects/${project.id}/responsibilities`).send({
        workstream: 'site_execution',
        wbsNodeId: wbs.id,
        title: `Site execution — riser mains ${run}`,
        assigneeId: recipient,
      }).expect(201);
    }

    const item = (await store.post('/api/v1/inventory/stock')
      .send({ code: `ACK-${run}`, name: '4mm² cable', unit: 'm', openingQty: 300, openingCost: 6 }).expect(201)).body;

    const moved = (await store.post(`/api/v1/inventory/stock/${item.id}/movements`).send({
      direction: 'out', quantity: 40, projectId: project.id, wbsNodeId: wbs.id, reason: 'issued to riser mains',
    }).expect(201)).body;

    return { projectId: project.id as string, wbsId: wbs.id as string, itemId: item.id as string, movementId: moved.movement.id as string };
  }

  const delivered = async (projectId: string, wbsId: string): Promise<number> => {
    const body = (await store.get('/api/v1/inventory/stock/work-package-deliveries')
      .query({ projectId, wbs: wbsId }).expect(200)).body;
    return body.deliveries[0].quantity as number;
  };

  const coverage = async (projectId: string, wbsId: string) =>
    (await store.get('/api/v1/inventory/stock/acknowledgement-coverage')
      .query({ projectId, wbs: wbsId }).expect(200)).body as { deliveries: number; acknowledged: number; outstanding: number };

  it('lets the responsible person accept the delivery, WITHOUT changing what was delivered', async () => {
    const s = await scene();
    expect(await delivered(s.projectId, s.wbsId)).toBe(40);
    expect(await coverage(s.projectId, s.wbsId)).toMatchObject({ deliveries: 1, acknowledged: 0, outstanding: 1 });

    const ack = (await site.post(`/api/v1/inventory/stock/${s.itemId}/movements/${s.movementId}/acknowledge`)
      .send({ note: 'received at the riser' }).expect(201)).body;
    expect(ack.acknowledgedBy).toBe('ack-site');
    expect(ack.wbsNodeId).toBe(s.wbsId);
    // THE RECEIPT CARRIES NO QUANTITY — not zero, not 40. The field does not exist.
    expect(ack).not.toHaveProperty('quantity');

    // …and the delivered quantity is exactly what it was. One authority, unmoved.
    expect(await delivered(s.projectId, s.wbsId)).toBe(40);
    expect(await coverage(s.projectId, s.wbsId)).toMatchObject({ deliveries: 1, acknowledged: 1, outstanding: 0 });
  });

  it('refuses anybody who is not the responsible person', async () => {
    const s = await scene();
    const res = await other.post(`/api/v1/inventory/stock/${s.itemId}/movements/${s.movementId}/acknowledge`).send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(String(res.body?.message ?? res.body?.error)).toMatch(/only the person responsible/i);
    expect(await coverage(s.projectId, s.wbsId)).toMatchObject({ acknowledged: 0 });
  });

  /** MAKER AND CHECKER: a receipt the issuer signs records somebody agreeing with themselves. */
  it('refuses the Storekeeper who issued the material, even if they were the recipient', async () => {
    const s = await scene({ recipient: 'ack-store' });
    const res = await store.post(`/api/v1/inventory/stock/${s.itemId}/movements/${s.movementId}/acknowledge`).send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(String(res.body?.message ?? res.body?.error)).toMatch(/cannot also acknowledge/i);
  });

  /** NO RECIPIENT AUTHORITY IS AN UNKNOWN, NOT AN OPEN DOOR. */
  it('refuses everybody when nobody owns site execution for the package', async () => {
    const s = await scene({ recipient: null });
    for (const agent of [site, other, admin]) {
      const res = await agent.post(`/api/v1/inventory/stock/${s.itemId}/movements/${s.movementId}/acknowledge`).send({});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(String(res.body?.message ?? res.body?.error)).toMatch(/site-execution responsibility.*nobody holds it/i);
    }
    // The delivery still happened; it is simply not receipted.
    expect(await delivered(s.projectId, s.wbsId)).toBe(40);
    expect(await coverage(s.projectId, s.wbsId)).toMatchObject({ deliveries: 1, acknowledged: 0, outstanding: 1 });
  });

  it('records one receipt per movement, so a replayed request does not make a second', async () => {
    const s = await scene();
    await site.post(`/api/v1/inventory/stock/${s.itemId}/movements/${s.movementId}/acknowledge`).send({}).expect(201);
    const again = await site.post(`/api/v1/inventory/stock/${s.itemId}/movements/${s.movementId}/acknowledge`).send({});
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(String(again.body?.message ?? again.body?.error)).toMatch(/already been acknowledged/i);
    expect(await coverage(s.projectId, s.wbsId)).toMatchObject({ deliveries: 1, acknowledged: 1, outstanding: 0 });
  });

  it('refuses to receipt an issue that named no work package', async () => {
    const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const project = (await admin.post('/api/v1/projects/projects').send({ title: `Plain job ${run}` }).expect(201)).body;
    const item = (await store.post('/api/v1/inventory/stock')
      .send({ code: `ACKP-${run}`, name: 'cable', unit: 'm', openingQty: 100, openingCost: 5 }).expect(201)).body;
    // A valid BUY-06 issue with no destination. Nobody can accept it on a package's behalf.
    const moved = (await store.post(`/api/v1/inventory/stock/${item.id}/movements`)
      .send({ direction: 'out', quantity: 10, projectId: project.id, reason: 'issued to project' }).expect(201)).body;

    const res = await site.post(`/api/v1/inventory/stock/${item.id}/movements/${moved.movement.id}/acknowledge`).send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(String(res.body?.message ?? res.body?.error)).toMatch(/not issued to a work package/i);
  });

  it('refuses a work package on another project when the responsibility is scoped', async () => {
    const a = await scene();
    const b = await scene();
    const res = await admin.post(`/api/v1/projects/${a.projectId}/responsibilities`).send({
      workstream: 'site_execution', wbsNodeId: b.wbsId, title: 'wrong project', assigneeId: 'ack-site',
    });
    expect(res.status).toBe(400);
    expect(String(res.body?.message ?? res.body?.error)).toMatch(/does not belong to this project/i);
  });

  it('refuses an unauthenticated caller', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/stock/00000000-0000-0000-0000-000000000000/movements/00000000-0000-0000-0000-000000000000/acknowledge')
      .send({}).expect(401);
  });
});
