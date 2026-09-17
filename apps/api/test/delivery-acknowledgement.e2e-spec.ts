import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, EVENT_STORE, type EventStore, TenantContext, UsersService } from '@aura/core';
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
  let unprivileged: ReturnType<typeof request.agent>;
  let events: EventStore;
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
    events = app.get(EVENT_STORE);

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

    // AUTHENTICATED BUT UNPRIVILEGED. Signs in perfectly well and holds no inventory permission at
    // all — the case an unauthenticated 401 says nothing about.
    access.registerRole({ id: 'r-e2e-ack-none', name: 'No inventory (e2e)', permissions: ['projects.project.read'] });
    access.grant({ userId: 'ack-nobody', roleId: 'r-e2e-ack-none', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    users.save({ tenantId: TENANT, userId: 'ack-nobody', displayName: 'ack-nobody', active: true });

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
    unprivileged = agent('ack-nobody');
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

  /**
   * THE DENIAL MATRIX — every refusal this capability can produce, with the status it must carry.
   *
   * Written because two of these came back as 500 INTERNAL SERVER ERROR while the static
   * error-taxonomy gate reported the capability clean: that gate scans throw-statement literals, and
   * a reason composed in a domain function and thrown elsewhere is invisible to it. A domain refusal
   * that escapes as a 500 is an API CONTRACT DEFECT in this capability, not a cosmetic one — a
   * caller cannot tell "you may not do this" from "the server broke".
   *
   * So the statuses are asserted here, through the HTTP layer, rather than inferred from wording.
   */
  it('gives every refusal a client status — no 500 escapes from any path', async () => {
    const s = await scene();
    const url = `/api/v1/inventory/stock/${s.itemId}/movements/${s.movementId}/acknowledge`;

    const cases: Array<{ what: string; run: () => Promise<request.Response>; status: number; match: RegExp }> = [
      {
        what: 'authenticated but holds no inventory permission',
        run: () => unprivileged.post(url).send({}),
        status: 403,
        match: /access denied|no grant satisfies|inventory.delivery.acknowledge/i,
      },
      {
        what: 'not the person responsible for the work package',
        run: () => other.post(url).send({}),
        status: 409,
        match: /only the person responsible/i,
      },
    ];

    for (const c of cases) {
      const res = await c.run();
      expect(res.status, `${c.what} → ${res.status} ${JSON.stringify(res.body)}`).toBe(c.status);
      expect(res.status, `${c.what} escaped as a server error`).toBeLessThan(500);
      expect(String(res.body?.message ?? res.body?.error), c.what).toMatch(c.match);
    }
  });

  it('gives the remaining refusals a client status too', async () => {
    // Nobody responsible → 409 (a conflict with the current state of the work package).
    const none = await scene({ recipient: null });
    const r1 = await site.post(`/api/v1/inventory/stock/${none.itemId}/movements/${none.movementId}/acknowledge`).send({});
    expect(r1.status, JSON.stringify(r1.body)).toBe(409);

    // The issuer signing for themselves → 400.
    const own = await scene({ recipient: 'ack-store' });
    const r2 = await store.post(`/api/v1/inventory/stock/${own.itemId}/movements/${own.movementId}/acknowledge`).send({});
    expect(r2.status, JSON.stringify(r2.body)).toBe(400);

    // A second receipt for the same movement → 409.
    const twice = await scene();
    await site.post(`/api/v1/inventory/stock/${twice.itemId}/movements/${twice.movementId}/acknowledge`).send({}).expect(201);
    const r3 = await site.post(`/api/v1/inventory/stock/${twice.itemId}/movements/${twice.movementId}/acknowledge`).send({});
    expect(r3.status, JSON.stringify(r3.body)).toBe(409);

    // An issue that named no work package → 400.
    const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const project = (await admin.post('/api/v1/projects/projects').send({ title: `Plain ${run}` }).expect(201)).body;
    const item = (await store.post('/api/v1/inventory/stock')
      .send({ code: `ACKN-${run}`, name: 'cable', unit: 'm', openingQty: 50, openingCost: 5 }).expect(201)).body;
    const moved = (await store.post(`/api/v1/inventory/stock/${item.id}/movements`)
      .send({ direction: 'out', quantity: 5, projectId: project.id, reason: 'issued to project' }).expect(201)).body;
    const r4 = await site.post(`/api/v1/inventory/stock/${item.id}/movements/${moved.movement.id}/acknowledge`).send({});
    expect(r4.status, JSON.stringify(r4.body)).toBe(400);

    for (const [label, res] of [['no recipient', r1], ['own issue', r2], ['duplicate', r3], ['no package', r4]] as const) {
      expect(res.status, `${label} escaped as a server error`).toBeLessThan(500);
    }
  });

  /**
   * THE ACTUAL OUTPUT — the frozen definition is "file, message, calculation or audit event where
   * the capability produces one", and for a handoff receipt it is an AUDIT EVENT: who accepted what
   * and when, on the spine, readable by any authority without asking Inventory.
   *
   * Asserted as PERSISTED rather than emitted. An event the code constructs but the spine never
   * receives is not an output, and that difference is invisible from inside the service.
   */
  it('puts the receipt on the event spine, carrying who accepted and who issued — and no quantity', async () => {
    const s = await scene();
    await site.post(`/api/v1/inventory/stock/${s.itemId}/movements/${s.movementId}/acknowledge`)
      .send({ note: 'received at the riser' }).expect(201);

    const recorded = (await events.list({ tenantId: TENANT }))
      .filter((e) => e.type === 'inventory.delivery.acknowledged');
    const mine = recorded.find((e) => (e.payload as { movementId?: string }).movementId === s.movementId);
    expect(mine, 'the acknowledgement never reached the spine').toBeDefined();

    const payload = mine!.payload as Record<string, unknown>;
    expect(payload.acknowledgedBy).toBe('ack-site');
    // WHO ISSUED IT TRAVELS WITH IT: the segregation of duties is auditable after the fact, not only
    // enforced at the moment of the click.
    expect(payload.issuedBy).toBe('ack-store');
    expect(payload.wbsNodeId).toBe(s.wbsId);
    expect(mine!.aggregateId).toBe(s.movementId);
    // Still no quantity, on the spine as in the record.
    expect(payload).not.toHaveProperty('quantity');
  });

  it('emits nothing when the receipt is refused, so the spine never records a handoff that did not happen', async () => {
    const s = await scene({ recipient: null });
    await site.post(`/api/v1/inventory/stock/${s.itemId}/movements/${s.movementId}/acknowledge`).send({}).expect(409);

    const recorded = (await events.list({ tenantId: TENANT }))
      .filter((e) => e.type === 'inventory.delivery.acknowledged')
      .filter((e) => (e.payload as { movementId?: string }).movementId === s.movementId);
    expect(recorded).toHaveLength(0);
  });

  it('refuses an unauthenticated caller', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/inventory/stock/00000000-0000-0000-0000-000000000000/movements/00000000-0000-0000-0000-000000000000/acknowledge')
      .send({}).expect(401);
  });
});
