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
 * `BUY-07` — material delivered to a work package, Auth-ON, JWT on.
 *
 * THE INVARIANT UNDER TEST:
 *
 *   A project issue does not inherently mean delivery to a work package. Any issue represented,
 *   projected, acknowledged or counted as delivered to a work package MUST carry an explicit
 *   validated `wbsNodeId`. Absence means UNKNOWN — never zero, and NEVER INFERRED from `boqItemId`.
 *
 * The inference clause needs a hostile test rather than a happy path, so the scene below deliberately
 * builds TWO work packages measuring against the SAME BOQ item. A resolver that matched on
 * `boqItemId` would report one issue as delivered to both, and would look more complete than the
 * truth while doing it.
 */

const TENANT = `wp-delivery-${Date.now()}`;

describe('material delivered to a work package (JWT ON)', () => {
  let app: INestApplication;
  let store: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'wp-delivery-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    access.registerRole({
      id: 'r-e2e-wp-store', name: 'Storekeeper (e2e)',
      permissions: ['inventory.*', 'projects.project.read', 'projects.*.read'],
    });
    access.grant({ userId: 'wp-store', roleId: 'r-e2e-wp-store', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'wp-admin', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 10_000_000 });
    for (const userId of ['wp-store', 'wp-admin']) {
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }

    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    expect(auth.enabled).toBe(true);

    const server = app.getHttpServer();
    store = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'wp-store', tenantId: TENANT })}`);
    admin = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'wp-admin', tenantId: TENANT })}`);
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  /**
   * A project, TWO work packages measuring the SAME BOQ item, and stock to issue from.
   * The shared BOQ item is the trap the inference clause has to survive.
   */
  async function scene(onHand = 500) {
    const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const project = (await admin.post('/api/v1/projects/projects').send({ title: `WP job ${run}` }).expect(201)).body;
    const boqItemId = `boq-wp-${run}`;
    await admin.post('/api/v1/projects/quantity-ledger/baseline')
      .send({ projectId: project.id, boqItemId, quantity: 1000, unit: 'm' }).expect(201);

    const mk = async (code: string, title: string, boq: string | null) =>
      (await admin.post('/api/v1/projects/wbs')
        .send({ projectId: project.id, code, title, boqItemId: boq }).expect(201)).body;

    const riser = await mk(`1.1-${run}`, 'Riser mains', boqItemId);
    const floor = await mk(`1.2-${run}`, 'Floor distribution', boqItemId); // SAME BOQ item, on purpose
    const unmeasured = await mk(`1.3-${run}`, 'Commissioning spares', null); // no BOQ linkage at all

    const item = (await store.post('/api/v1/inventory/stock')
      .send({ code: `WP-${run}`, name: '4mm² cable', unit: 'm', openingQty: onHand, openingCost: 6 })
      .expect(201)).body;

    return { projectId: project.id as string, boqItemId, riser, floor, unmeasured, itemId: item.id as string };
  }

  const move = (itemId: string, body: Record<string, unknown>) =>
    store.post(`/api/v1/inventory/stock/${itemId}/movements`).send(body);

  const deliveries = async (projectId: string, wbs: string[]) =>
    (await store.get('/api/v1/inventory/stock/work-package-deliveries')
      .query({ projectId, wbs: wbs.join(',') }).expect(200)).body as {
        deliveries: Array<{ wbsNodeId: string; quantity: number; value: number; movements: number }>;
        unspecified: { quantity: number; value: number; movements: number };
      };

  it('records a validated work package as the destination of an issue', async () => {
    const s = await scene();
    await move(s.itemId, {
      direction: 'out', quantity: 40, projectId: s.projectId, boqItemId: s.boqItemId,
      wbsNodeId: s.riser.id, reason: 'issued to riser mains',
    }).expect(201);

    const report = await deliveries(s.projectId, [s.riser.id, s.floor.id]);
    expect(report.deliveries.find((d) => d.wbsNodeId === s.riser.id)).toMatchObject({ quantity: 40, movements: 1 });
    // 40 × 6.00, the cost the material was issued at.
    expect(report.deliveries.find((d) => d.wbsNodeId === s.riser.id)!.value).toBe(240);
  });

  /**
   * THE CLAUSE WITH TEETH. Both packages measure the same BOQ item; only one was named.
   */
  it('never lets the OTHER work package on the same BOQ item claim the material', async () => {
    const s = await scene();
    await move(s.itemId, {
      direction: 'out', quantity: 40, projectId: s.projectId, boqItemId: s.boqItemId,
      wbsNodeId: s.riser.id, reason: 'issued to riser mains',
    }).expect(201);

    const report = await deliveries(s.projectId, [s.riser.id, s.floor.id]);
    expect(report.deliveries.find((d) => d.wbsNodeId === s.riser.id)!.quantity).toBe(40);
    // A measured zero, not an inherited 40.
    expect(report.deliveries.find((d) => d.wbsNodeId === s.floor.id)).toMatchObject({ quantity: 0, movements: 0 });
    // And the total across packages is what actually left the store — not double.
    expect(report.deliveries.reduce((sum, d) => sum + d.quantity, 0)).toBe(40);
  });

  it('leaves a BUY-06 issue with no work package valid, unattributed, and visible at project level', async () => {
    const s = await scene();
    // Exactly the BUY-06 shape: project + BOQ item, no destination claimed. Still accepted.
    await move(s.itemId, {
      direction: 'out', quantity: 25, projectId: s.projectId, boqItemId: s.boqItemId,
      reason: 'issued to project',
    }).expect(201);

    const report = await deliveries(s.projectId, [s.riser.id, s.floor.id]);
    // Counted against NO package — not spread across them as UNKNOWN.
    expect(report.deliveries.every((d) => d.quantity === 0)).toBe(true);
    // Reported once, for the project, where the absence is actionable.
    expect(report.unspecified).toMatchObject({ quantity: 25, movements: 1 });
    expect(report.unspecified.value).toBe(150);
  });

  it('refuses a work package belonging to another project', async () => {
    const a = await scene();
    const b = await scene();
    const res = await move(a.itemId, {
      direction: 'out', quantity: 5, projectId: a.projectId, boqItemId: a.boqItemId,
      wbsNodeId: b.riser.id, reason: 'issued to the wrong project’s package',
    });
    expect(res.status).toBe(400);
    expect(String(res.body?.message ?? res.body?.error)).toMatch(/does not belong/i);

    // Nothing was written: a movement that should not exist must not exist even briefly.
    const report = await deliveries(a.projectId, [a.riser.id]);
    expect(report.deliveries[0]).toMatchObject({ quantity: 0, movements: 0 });
  });

  it('refuses a work package named on a movement that is not coded to a project', async () => {
    const s = await scene();
    const res = await move(s.itemId, { direction: 'out', quantity: 5, wbsNodeId: s.riser.id });
    expect(res.status).toBe(400);
    expect(String(res.body?.message ?? res.body?.error)).toMatch(/not coded to a project/i);
  });

  it('nets a return coded to the same package, and refuses an unattributed one to erase it', async () => {
    const s = await scene();
    const issue = { direction: 'out', projectId: s.projectId, boqItemId: s.boqItemId, wbsNodeId: s.riser.id };
    await move(s.itemId, { ...issue, quantity: 20, reason: 'issued' }).expect(201);
    await move(s.itemId, {
      direction: 'in', quantity: 5, projectId: s.projectId, boqItemId: s.boqItemId,
      wbsNodeId: s.riser.id, reason: 'returned from riser mains',
    }).expect(201);

    let report = await deliveries(s.projectId, [s.riser.id]);
    expect(report.deliveries[0].quantity).toBe(15);

    // A return naming NO package cannot reduce a package's delivery — nobody said which one it came
    // from, and guessing would let an unattributed return erase a recorded one.
    await move(s.itemId, {
      direction: 'in', quantity: 5, projectId: s.projectId, boqItemId: s.boqItemId,
      reason: 'returned, destination not recorded',
    }).expect(201);
    report = await deliveries(s.projectId, [s.riser.id]);
    expect(report.deliveries[0].quantity).toBe(15);
    // It lands in the project-level pool instead, as a negative against unattributed issues.
    expect(report.unspecified.quantity).toBe(-5);
  });

  it('delivers to a work package that has NO BOQ item, because destination and measurement differ', async () => {
    const s = await scene();
    await move(s.itemId, {
      direction: 'out', quantity: 12, projectId: s.projectId,
      wbsNodeId: s.unmeasured.id, reason: 'issued to commissioning spares',
    }).expect(201);

    const report = await deliveries(s.projectId, [s.unmeasured.id]);
    // The material went there and was recorded going there. A missing BOQ mapping is a separate
    // absence and must not be manufactured to make the delivery look complete.
    expect(report.deliveries[0]).toMatchObject({ quantity: 12, movements: 1 });
  });

  it('requires a project on the report, and refuses an unauthenticated caller', async () => {
    await store.get('/api/v1/inventory/stock/work-package-deliveries').expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/inventory/stock/work-package-deliveries').query({ projectId: 'p' }).expect(401);
  });
});
