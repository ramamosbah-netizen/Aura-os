// AURA OS — BUY-01 / J3-05: a material requisition finally has materials on it.
//
// A requisition was a title, a number and a project. It could not say WHAT was needed, HOW MUCH,
// in WHAT UNIT or BY WHEN — so everything downstream of it was a conversation somebody had to
// remember. Wave 4 cannot compare two supplier offers "for this material" until a line exists to
// be the subject of the comparison.
//
// Proven with JWT ON throughout, because two of the four things under test are authority splits:
//
//   · the Storekeeper owns the catalogue of WHAT things are; the Buyer raises demand against it
//     and cannot invent a material while doing so;
//   · a line names a CANONICAL material by reference and keeps its OWN copy of the description,
//     so correcting the catalogue later cannot rewrite what a requisition meant;
//   · a value nobody stated does not become a number — an unpriced line leaves the requisition
//     with NO value rather than a smaller one, because the value decides who may approve it;
//   · and the lines are frozen the moment the requisition is sent for that decision.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `req-lines-${Date.now()}`;

interface Material { id: string; code: string; name: string; uom: string; status: string; model: string | null }
interface Line {
  id: string; lineNo: number; materialId: string; materialCode: string; materialName: string;
  specification: string | null; manufacturer: string | null; model: string | null; uom: string;
  quantity: number; needByDate: string | null; estimatedUnitCost: number | null;
  wbsNodeId: string | null; cbsNodeId: string | null;
}
interface Summary {
  total: { lineCount: number; pricedCount: number; unpricedCount: number; pricedSubtotal: number; complete: boolean; value: number | null };
  governing: { value: number | null; derived: boolean };
  submission: { ready: boolean; reason?: string };
}

describe('a material requisition names materials, in units, by a date (JWT ON)', () => {
  let app: INestApplication;
  /** Owns the catalogue: `inventory.*`, and only READS procurement. */
  let store: ReturnType<typeof request.agent>;
  /** Raises demand: authors requisition lines, and cannot create a material. */
  let buyer: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;
  let projectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'requisition-lines-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    // The two shipped roles, narrowed to the permissions actually under test. That the SHIPPED
    // catalogue carries this same split is asserted separately over the role catalogue itself.
    access.registerRole({
      id: 'r-e2e-store', name: 'Storekeeper (e2e)',
      permissions: ['inventory.*', 'procurement.*.read', 'projects.project.read'],
    });
    access.registerRole({
      id: 'r-e2e-buyer', name: 'Buyer (e2e)',
      // Reads the catalogue, authors requisitions and their lines — and holds NO write on inventory.
      permissions: ['inventory.*.read', 'procurement.*.read', 'procurement.*.create', 'procurement.*.update', 'projects.project.read'],
    });
    access.grant({ userId: 'rl-store', roleId: 'r-e2e-store', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'rl-buyer', roleId: 'r-e2e-buyer', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'rl-admin', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 10_000_000 });
    for (const userId of ['rl-store', 'rl-buyer', 'rl-admin']) {
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
    store = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'rl-store', tenantId: TENANT })}`);
    buyer = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'rl-buyer', tenantId: TENANT })}`);
    admin = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'rl-admin', tenantId: TENANT })}`);

    projectId = (await admin.post('/api/v1/projects/projects').send({ title: 'Containment job' }).expect(201)).body.id;
    otherProjectId = (await admin.post('/api/v1/projects/projects').send({ title: 'A different job' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  const newPr = async (): Promise<string> =>
    (await buyer.post('/api/v1/procurement/purchase-requests')
      .send({ title: `Materials ${Date.now()}`, projectId, value: 0 }).expect(201)).body.id;

  const summaryOf = async (prId: string): Promise<Summary> =>
    (await buyer.get(`/api/v1/procurement/purchase-requests/${prId}/lines/summary`).expect(200)).body as Summary;

  // ── The catalogue: who owns WHAT a thing is ─────────────────────────────────

  let camera: Material;
  let cable: Material;

  it('lets the Storekeeper author the catalogue, and refuses the Buyer', async () => {
    const run = Date.now().toString().slice(-6);
    camera = (await store.post('/api/v1/inventory/materials').send({
      code: `CAM-${run}`, name: '4MP dome camera', uom: 'nr',
      specification: 'IP67, 2.8mm fixed lens', manufacturer: 'Hikvision', model: 'DS-2CD2143G2-I',
    }).expect(201)).body;
    cable = (await store.post('/api/v1/inventory/materials').send({
      code: `CBL-${run}`, name: 'Cat6 U/UTP cable', uom: 'm',
    }).expect(201)).body;

    expect(camera).toMatchObject({ uom: 'nr', status: 'active', model: 'DS-2CD2143G2-I' });
    // A Buyer raises demand; they do not decide what exists. Read is theirs, write is not.
    await buyer.post('/api/v1/inventory/materials')
      .send({ code: `X-${run}`, name: 'Invented on the spot', uom: 'nr' }).expect(403);
    await buyer.get('/api/v1/inventory/materials').expect(200);
  });

  it('refuses a second material on the same code, naming what already holds it', async () => {
    const dup = await store.post('/api/v1/inventory/materials')
      .send({ code: camera.code, name: 'A different camera', uom: 'nr' }).expect(409);
    expect(dup.body.message).toMatch(/already used by "4MP dome camera"/);
  });

  it('refuses to change a code or a unit rather than silently dropping the attempt', async () => {
    // Both are refused because both silently rewrite meaning: the code is what people type, and
    // the unit is what every quantity of this material means.
    await store.patch(`/api/v1/inventory/materials/${camera.id}`).send({ code: 'RE-CODED' }).expect(400);
    await store.patch(`/api/v1/inventory/materials/${camera.id}`).send({ uom: 'box' }).expect(400);
    const unchanged = (await store.get(`/api/v1/inventory/materials/${camera.id}`).expect(200)).body as Material;
    expect(unchanged).toMatchObject({ code: camera.code, uom: 'nr' });
  });

  // ── The line: identity by reference, description by value ───────────────────

  it('authors a line that names a canonical material and copies its whole description', async () => {
    const prId = await newPr();
    const line = (await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: camera.code, quantity: 12, estimatedUnitCost: 450, needByDate: '2026-11-01' })
      .expect(201)).body as Line;

    expect(line).toMatchObject({
      lineNo: 1,
      materialId: camera.id,            // identity, by reference
      materialCode: camera.code,        // …and the description, by value
      materialName: '4MP dome camera',
      specification: 'IP67, 2.8mm fixed lens',
      manufacturer: 'Hikvision',
      model: 'DS-2CD2143G2-I',
      uom: 'nr',
      quantity: 12,
      estimatedUnitCost: 450,
      needByDate: '2026-11-01',
    });
  });

  it('takes the unit from the material — a requisition cannot invent one', async () => {
    const prId = await newPr();
    const line = (await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: cable.code, quantity: 250, estimatedUnitCost: 4, uom: 'box' })
      .expect(201)).body as Line;
    // `uom` in the payload is not a field the DTO accepts; the unit comes from the master.
    expect(line.uom).toBe('m');
  });

  it('refuses a material nobody can resolve, and leaves the requisition empty', async () => {
    const prId = await newPr();
    const refused = await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: 'NOT-A-REAL-CODE', quantity: 1 }).expect(400);
    expect(refused.body.message).toMatch(/no material matches "NOT-A-REAL-CODE"/);
    expect((await buyer.get(`/api/v1/procurement/purchase-requests/${prId}/lines`).expect(200)).body).toHaveLength(0);
  });

  it('refuses an obsolete material on new demand, and leaves the lines that already cite it alone', async () => {
    const prId = await newPr();
    const priorLine = (await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: cable.code, quantity: 100, estimatedUnitCost: 4 }).expect(201)).body as Line;

    await store.patch(`/api/v1/inventory/materials/${cable.id}/status`).send({ status: 'obsolete' }).expect(200);

    const refused = await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: cable.code, quantity: 50, estimatedUnitCost: 4 }).expect(409);
    expect(refused.body.message).toMatch(/obsolete and is not active for new demand/);

    // Retirement is a statement about FUTURE demand. The existing line is untouched and readable.
    const lines = (await buyer.get(`/api/v1/procurement/purchase-requests/${prId}/lines`).expect(200)).body as Line[];
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ id: priorLine.id, materialCode: cable.code, quantity: 100 });

    await store.patch(`/api/v1/inventory/materials/${cable.id}/status`).send({ status: 'active' }).expect(200);
  });

  it('CORRECTING THE CATALOGUE DOES NOT REWRITE WHAT A REQUISITION MEANT', async () => {
    const prId = await newPr();
    const before = (await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: camera.code, quantity: 5, estimatedUnitCost: 450 }).expect(201)).body as Line;

    // The Storekeeper corrects the master afterwards — a new model number, a tighter spec.
    await store.patch(`/api/v1/inventory/materials/${camera.id}`)
      .send({ name: '4MP dome camera (IK10)', specification: 'IP67/IK10, 2.8mm', model: 'DS-2CD2143G2-IU' })
      .expect(200);

    const after = (await buyer.get(`/api/v1/procurement/purchase-requests/${prId}/lines`).expect(200)).body as Line[];
    // The line still says what was asked for at the time it was asked for — the OLD name, the OLD
    // specification and the OLD model, none of which the catalogue still holds.
    expect(after[0]).toMatchObject({
      materialName: '4MP dome camera',
      specification: 'IP67, 2.8mm fixed lens',
      model: 'DS-2CD2143G2-I',
    });
    // …while still pointing at the same material, so the identity is followable either way.
    expect(after[0].materialId).toBe(before.materialId);
    expect((await store.get(`/api/v1/inventory/materials/${camera.id}`).expect(200)).body.name)
      .toBe('4MP dome camera (IK10)');
  });

  // ── Coding belongs to the requisition's own project ─────────────────────────

  it('refuses a cost code from a different project', async () => {
    const prId = await newPr();
    const foreignCbs = (await admin.post('/api/v1/projects/cbs')
      .send({ projectId: otherProjectId, code: 'CBS-X', title: 'Another job’s cost code' }).expect(201)).body;
    const refused = await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: camera.code, quantity: 1, estimatedUnitCost: 1, cbsNodeId: foreignCbs.id }).expect(400);
    expect(refused.body.message).toMatch(/does not belong to this requisition's project/);
  });

  // ── An unknown value does not become a number ───────────────────────────────

  it('derives the requisition value from its lines, and the header stops speaking', async () => {
    const prId = await newPr();
    await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: camera.code, quantity: 12, estimatedUnitCost: 450 }).expect(201);
    await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: cable.code, quantity: 250, estimatedUnitCost: 4 }).expect(201);

    const s = await summaryOf(prId);
    expect(s.total).toMatchObject({ lineCount: 2, pricedCount: 2, unpricedCount: 0, complete: true, value: 6400 });
    expect(s.governing).toEqual({ value: 6400, derived: true });
    expect(s.submission).toMatchObject({ ready: true });
  });

  it('reports NO value while a line is unpriced — not zero, and not the partial sum', async () => {
    const prId = await newPr();
    await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: camera.code, quantity: 10, estimatedUnitCost: 450 }).expect(201);
    await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: cable.code, quantity: 250 }).expect(201);

    const s = await summaryOf(prId);
    expect(s.total).toMatchObject({ pricedCount: 1, unpricedCount: 1, pricedSubtotal: 4500, complete: false, value: null });
    expect(s.governing.value).toBeNull();
    // …and the refusal names the line to fix, because "incomplete" is not actionable on its own.
    expect(s.submission.ready).toBe(false);
    expect(s.submission.reason).toMatch(/decides who may approve it/);
    expect(s.submission.reason).toContain('line 2');
  });

  // ── Save, reload, and freeze at submission ──────────────────────────────────

  it('survives a reload, edits the demand, and closes the gap when a line is removed', async () => {
    const prId = await newPr();
    const first = (await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: camera.code, quantity: 1, estimatedUnitCost: 450 }).expect(201)).body as Line;
    const second = (await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: cable.code, quantity: 2, estimatedUnitCost: 4 }).expect(201)).body as Line;
    const third = (await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: camera.code, quantity: 3, estimatedUnitCost: 450 }).expect(201)).body as Line;

    await buyer.patch(`/api/v1/procurement/purchase-requests/${prId}/lines/${first.id}`)
      .send({ quantity: 20, estimatedUnitCost: 460 }).expect(200);
    await buyer.delete(`/api/v1/procurement/purchase-requests/${prId}/lines/${second.id}`).expect(200);

    const reloaded = (await buyer.get(`/api/v1/procurement/purchase-requests/${prId}/lines`).expect(200)).body as Line[];
    expect(reloaded.map((l) => l.lineNo)).toEqual([1, 2]);
    expect(reloaded[0]).toMatchObject({ id: first.id, quantity: 20, estimatedUnitCost: 460 });
    expect(reloaded[1]).toMatchObject({ id: third.id, quantity: 3 });
    expect((await summaryOf(prId)).governing.value).toBe(20 * 460 + 3 * 450);
  });

  it('freezes the lines once the requisition has been sent for a decision', async () => {
    const prId = await newPr();
    const line = (await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: camera.code, quantity: 4, estimatedUnitCost: 450 }).expect(201)).body as Line;

    // Submitted by the admin, NOT the buyer: `PATCH .../:id/status` derives
    // `procurement.purchase-request.status`, an action word no shipped procurement role grants, so
    // a Buyer cannot submit their own requisition under Auth-ON. Pre-existing, unrelated to lines,
    // and recorded as a finding rather than repaired inside this slice.
    await admin.patch(`/api/v1/procurement/purchase-requests/${prId}/status`).send({ status: 'submitted' }).expect(200);

    // Approving one thing and buying another is the outcome this prevents.
    await buyer.post(`/api/v1/procurement/purchase-requests/${prId}/lines`)
      .send({ material: cable.code, quantity: 1, estimatedUnitCost: 4 }).expect(409);
    await buyer.patch(`/api/v1/procurement/purchase-requests/${prId}/lines/${line.id}`)
      .send({ quantity: 4000 }).expect(409);
    await buyer.delete(`/api/v1/procurement/purchase-requests/${prId}/lines/${line.id}`).expect(409);

    const still = (await buyer.get(`/api/v1/procurement/purchase-requests/${prId}/lines`).expect(200)).body as Line[];
    expect(still).toHaveLength(1);
    expect(still[0].quantity).toBe(4);
  });

  it('refuses an unauthenticated caller outright', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/v1/inventory/materials').expect(401);
    await request(server).post('/api/v1/procurement/purchase-requests/whatever/lines').send({ material: 'x', quantity: 1 }).expect(401);
  });
});
