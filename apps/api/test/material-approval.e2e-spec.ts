// AURA OS — ENG-04: the canonical material approval record, and the one rule Procurement owns.
//
// A Material Approval Request is the governed record of an approved material submittal: the
// contractor proposes a product — manufacturer, supplier, specification — and the consultant
// approves it, approves it as noted, or rejects it. Quality owns that decision.
//
// PROCUREMENT OWNS EXACTLY ONE RULE ABOUT IT, and this suite is careful not to imply a second: a
// supplier with a REJECTED request on the project cannot have a purchase order issued against it.
// Its own pinned tests say so in both directions — blocks on a rejection, ALLOWS when there is
// none. ENG-04 briefly widened that to refuse undecided requests too; it was reverted, because
// nothing owned it and a supplier-level PENDING for one material would have blocked an order for a
// different one.
//
// What NO rule here can say is whether the material on a given order is the approved one. That
// needs a canonical purchased-material identity carried from requisition line through RFQ, PO, GRN
// and site issue, which does not exist in this system; the frozen roadmap gives it to Wave 4
// (`BUY-01 Material requisition lines`). The last test states that limit rather than hiding it.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `mar-tenant-${Date.now()}`;

interface Mar {
  id: string; reference: string; materialName: string; status: string;
  supplier: string; supplierId: string | null; reviewedBy: string | null; reviewedAt: string | null;
  reviewComments: string; revision: number;
}
interface Po { id: string; reference: string | null; status: string }
interface WorkItem { id: string; title: string; detail: string | null; href: string; status: string; sourceStatus: string; projectId: string | null }

describe('the canonical material approval, and the rule Procurement owns (HTTP)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let projectId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);
    for (const userId of ['mar-engineer', 'mar-consultant', 'mar-outsider']) {
      access.grant({ userId, roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 10_000_000 });
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }
    app.use((req: { headers?: Record<string, string> }, _res: unknown, next: () => void) =>
      tenant.run({ tenantId: TENANT, companyId: null, actorId: req.headers?.['x-e2e-actor'] ?? 'mar-engineer', correlationId: 'e2e-mar' }, () => next()),
    );
    await app.init();
    http = request(app.getHttpServer());
    projectId = (await http.post('/api/v1/projects/projects').send({ title: 'Material job' }).expect(201)).body.id;
  });

  afterAll(async () => { await app?.close(); });

  /** A purchase order for a supplier on this project, taken as far as `approved`. */
  const orderFrom = async (supplierName: string, reference: string): Promise<Po> => {
    const po = (await http.post('/api/v1/procurement/purchase-orders').send({
      title: `Order ${reference}`, reference, supplierName, projectId, value: 5_000,
    }).expect(201)).body as Po;
    // The real lifecycle: a PO is submitted for approval and approved, not moved straight there.
    await http.post(`/api/v1/procurement/purchase-orders/${po.id}/submit`).expect(201);
    await http.post(`/api/v1/procurement/purchase-orders/${po.id}/approve`).send({ approverLevel: 1 }).expect(201);
    return po;
  };
  /**
   * Issuing is its own command and reachable only from approved (J3-01). The order arrives here
   * already approved — `raise` above submits and approves it — so this is the act the quality gate
   * actually guards: the moment the commitment goes out to the supplier.
   */
  const issue = (po: Po) =>
    http.post(`/api/v1/procurement/purchase-orders/${po.id}/issue`);

  const raise = async (reference: string, supplier: string): Promise<Mar> =>
    (await http.post('/api/v1/quality/material-approvals').send({
      projectId, reference, materialName: 'FP200 Gold 2C 1.5mm', manufacturer: 'Prysmian', supplier,
    }).expect(201)).body as Mar;

  it('raises a material approval request as a draft, undecided and unattributed', async () => {
    const mar = await raise('MAR-001', 'Gulf Cables LLC');
    expect(mar).toMatchObject({ status: 'draft', revision: 0, reviewedBy: null, reviewedAt: null, reviewComments: '' });
  });

  it('moves draft → submitted → decided, and records WHO decided it', async () => {
    const mars = (await http.get(`/api/v1/quality/material-approvals?projectId=${projectId}`).expect(200)).body as Mar[];
    const draft = mars.find((m) => m.reference === 'MAR-001')!;
    await http.put(`/api/v1/quality/material-approvals/${draft.id}/submit`).expect(200);

    const decided = (await http.put(`/api/v1/quality/material-approvals/${draft.id}/review`)
      .set('x-e2e-actor', 'mar-consultant')
      .send({ decision: 'approved' }).expect(200)).body as Mar;
    expect(decided).toMatchObject({ status: 'approved', reviewedBy: 'mar-consultant' });
    expect(decided.reviewedAt).not.toBeNull();
  });

  it('allows a purchase order where the supplier carries no refusal', async () => {
    // Procurement's owned rule, in the direction its own suite pins: no rejection means allow.
    const po = await orderFrom('Gulf Cables LLC', 'PO-CLEAR');
    const issued = await issue(po);
    // 201: issuing is a POSTed command now, not a PATCHed status (J3-01).
    expect(issued.status, JSON.stringify(issued.body)).toBe(201);
    expect(issued.body.status).toBe('issued');
  });

  it('REFUSES one where the consultant rejected something this supplier proposed', async () => {
    const rejected = await raise('MAR-002', 'Dodgy Trading LLC');
    await http.put(`/api/v1/quality/material-approvals/${rejected.id}/submit`).expect(200);
    await http.put(`/api/v1/quality/material-approvals/${rejected.id}/review`)
      .set('x-e2e-actor', 'mar-consultant')
      .send({ decision: 'rejected', comments: 'not to specification' }).expect(200);

    const po = await orderFrom('Dodgy Trading LLC', 'PO-REJECTED');
    const refused = await issue(po);
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/rejected material approval request/);
  });

  it('reports the refusal sitting beside an approval, rather than the approval', async () => {
    // Reporting only the approval would hide the refusal behind it, and the refusal is the one that
    // stops a purchase order.
    const second = await raise('MAR-003', 'Gulf Cables LLC');
    await http.put(`/api/v1/quality/material-approvals/${second.id}/submit`).expect(200);
    await http.put(`/api/v1/quality/material-approvals/${second.id}/review`)
      .set('x-e2e-actor', 'mar-consultant')
      .send({ decision: 'rejected', comments: 'wrong drum length' }).expect(200);

    const po = await orderFrom('Gulf Cables LLC', 'PO-MIXED');
    const refused = await issue(po);
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/MAR-003/);
  });

  it('does NOT claim the material on an order is the approved one — the stated limit', async () => {
    // An approved request for fire-rated cable says nothing about the containment bought from the
    // same company, and this system cannot tell the two orders apart: a purchase order carries no
    // material identity at all. The supplier rule passes both, which is what it is entitled to do
    // and no more. Wave 4 (`BUY-01`) owns the identity that would answer the real question, and
    // recording that here stops the passing order being read as an approved material.
    const clean = await raise('MAR-004', 'Clean Supplier LLC');
    await http.put(`/api/v1/quality/material-approvals/${clean.id}/submit`).expect(200);
    await http.put(`/api/v1/quality/material-approvals/${clean.id}/review`)
      .set('x-e2e-actor', 'mar-consultant').send({ decision: 'approved' }).expect(200);

    // A completely different material from the same supplier. Nothing distinguishes it.
    const other = await orderFrom('Clean Supplier LLC', 'PO-OTHER-MATERIAL');
    const issued = await issue(other);
    expect(issued.status).toBe(201);
    // The order names no material, which is exactly why the question cannot be asked yet.
    const po = (await http.get(`/api/v1/procurement/purchase-orders/${other.id}`).expect(200)).body as { boqItemId: string | null };
    expect(po.boqItemId).toBeNull();
  });

  // ── The next-role receipt (frozen DoD) ──────────────────────────────────────
  //
  // An engineer proposes a product and somebody else decides it. Without the decision coming back,
  // the request lands in a register nobody is watching — it simply goes quiet, which from the
  // proposer's side is indistinguishable from still waiting.

  const inbox = async (actor: string): Promise<WorkItem[]> =>
    ((await http.get('/api/v1/work-items').set('x-e2e-actor', actor).expect(200)).body as { items: WorkItem[] }).items;

  it('puts the request in the proposer’s work list, and the decision brings it back', async () => {
    const mar = (await http.post('/api/v1/quality/material-approvals').set('x-e2e-actor', 'mar-engineer').send({
      projectId, reference: 'MAR-RECEIPT', materialName: 'Cable tray 300mm', manufacturer: 'Unitrunk',
      supplier: 'Gulf Cables LLC',
    }).expect(201)).body as Mar;
    const id = `quality-material-approval:${mar.id}`;

    // Drafted and not yet sent: it is the proposer's move.
    expect((await inbox('mar-engineer')).find((i) => i.id === id)).toMatchObject({ status: 'todo', sourceStatus: 'draft', projectId });

    // Submitted: the ball is with the decider, and the proposer is waiting rather than idle.
    await http.put(`/api/v1/quality/material-approvals/${mar.id}/submit`).set('x-e2e-actor', 'mar-engineer').expect(200);
    expect((await inbox('mar-engineer')).find((i) => i.id === id)).toMatchObject({ status: 'waiting', sourceStatus: 'submitted' });

    // Approved as noted — THE RECEIPT. Binding conditions came back with it, so this is work for the
    // proposer, not a finished item filed away where the conditions are never read.
    await http.put(`/api/v1/quality/material-approvals/${mar.id}/review`).set('x-e2e-actor', 'mar-consultant')
      .send({ decision: 'approved_as_noted', comments: 'LSZH variant only' }).expect(200);
    const back = (await inbox('mar-engineer')).find((i) => i.id === id);
    expect(back).toMatchObject({ status: 'todo', sourceStatus: 'approved_as_noted' });
    expect(back!.title).toContain('MAR-RECEIPT');
    // The CONDITIONS travel with the receipt. An as-noted approval whose comments the proposer has
    // to open a second screen to discover is a receipt that hides the part that binds them.
    expect(back!.detail).toContain('LSZH variant only');
    // …and it points back at the canonical register entry, where the revision and full decision are.
    expect(back!.href).toContain('/quality/material-approvals');
    expect(back!.href).toContain(mar.id);

    // The decider holds it too, as their own decision.
    expect((await inbox('mar-consultant')).find((i) => i.id === id)).toBeDefined();
  });

  it('settles it for both sides once approved outright', async () => {
    const mar = (await http.post('/api/v1/quality/material-approvals').set('x-e2e-actor', 'mar-engineer').send({
      projectId, reference: 'MAR-SETTLED', materialName: 'Fire collar', supplier: 'Gulf Cables LLC',
    }).expect(201)).body as Mar;
    await http.put(`/api/v1/quality/material-approvals/${mar.id}/submit`).set('x-e2e-actor', 'mar-engineer').expect(200);
    await http.put(`/api/v1/quality/material-approvals/${mar.id}/review`).set('x-e2e-actor', 'mar-consultant')
      .send({ decision: 'approved' }).expect(200);
    expect((await inbox('mar-engineer')).find((i) => i.id === `quality-material-approval:${mar.id}`))
      .toMatchObject({ status: 'done', sourceStatus: 'approved' });
  });

  it('shows it to nobody outside the exchange', async () => {
    expect((await inbox('mar-outsider')).filter((i) => i.title.includes('MAR-RECEIPT'))).toEqual([]);
  });

  it('refuses a MATERIAL submittal in the second, ungoverned register', async () => {
    // That register can mark one `approved` with no reviewer, no comments and nothing downstream
    // reading it. Two registers answering "is this material approved?" is one of them being wrong,
    // silently, on the day they disagree.
    const refused = await http.post('/api/v1/engineering/submittals').send({
      projectId, code: 'SUB-001', title: 'Cable material submittal', submittalType: 'material',
    });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/Material Approval Request in Quality/);
  });

  it('still accepts the submittal types that register does own', async () => {
    const technical = await http.post('/api/v1/engineering/submittals').send({
      projectId, code: 'SUB-002', title: 'Method statement', submittalType: 'technical',
    }).expect(201);
    expect(technical.body).toMatchObject({ submittalType: 'technical', status: 'draft' });
  });
});

/**
 * The authority boundary, with JWT on.
 *
 * An engineer proposes the product they intend to install; somebody else decides it. That is the
 * whole value of a Material Approval Request, and a permission is what makes it true rather than a
 * convention. The shipped roles carry this same split — asserted over the role catalogue itself in
 * src/auth/elv-roles.test.ts — and these are bespoke so the only variable is the one permission.
 */
describe('who may propose a material and who may decide it (JWT ON)', () => {
  let app: INestApplication;
  let engineer: ReturnType<typeof request.agent>;
  let manager: ReturnType<typeof request.agent>;
  let projectId: string;
  let marId: string;
  const AUTH_TENANT = `mar-auth-${Date.now()}`;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'material-approval-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());
    const auth = app.get(AuthService);
    const tenant = app.get(TenantContext);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    access.registerRole({
      id: 'r-e2e-mar-engineer', name: 'Design Engineer (e2e)',
      permissions: ['quality.material-approval.create', 'quality.material-approval.submit',
        'quality.material-approval.read', 'quality.material-approval.revise', 'projects.project.read', 'work-items.*'],
    });
    access.registerRole({
      id: 'r-e2e-mar-manager', name: 'Technical Manager (e2e)',
      permissions: ['quality.material-approval.review', 'quality.material-approval.read', 'projects.project.read', 'work-items.*'],
    });
    access.grant({ userId: 'mar-eng', roleId: 'r-e2e-mar-engineer', scope: { kind: 'org', level: 'tenant', id: AUTH_TENANT } });
    access.grant({ userId: 'mar-mgr', roleId: 'r-e2e-mar-manager', scope: { kind: 'org', level: 'tenant', id: AUTH_TENANT } });
    access.grant({ userId: 'mar-adm', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: AUTH_TENANT }, approvalLimit: 1_000_000 });
    for (const userId of ['mar-eng', 'mar-mgr', 'mar-adm']) users.save({ tenantId: AUTH_TENANT, userId, displayName: userId, active: true });

    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    expect(auth.enabled).toBe(true);

    const server = app.getHttpServer();
    engineer = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'mar-eng', tenantId: AUTH_TENANT })}`);
    manager = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'mar-mgr', tenantId: AUTH_TENANT })}`);
    const admin = request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub: 'mar-adm', tenantId: AUTH_TENANT })}`);
    projectId = (await admin.post('/api/v1/projects/projects').send({ title: 'Guarded materials' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.AUTH_JWT_SECRET;
  });

  it('lets the engineer propose a material and send it', async () => {
    // Establishes that the refusal below is about ONE permission, not about being shut out.
    const mar = (await engineer.post('/api/v1/quality/material-approvals').send({
      projectId, reference: 'MAR-AUTH-1', materialName: 'FP200 Gold', supplier: 'Gulf Cables LLC',
    }).expect(201)).body as Mar;
    marId = mar.id;
    await engineer.put(`/api/v1/quality/material-approvals/${marId}/submit`).expect(200);
  });

  it('refuses the proposing engineer the act of DECIDING it', async () => {
    await engineer.put(`/api/v1/quality/material-approvals/${marId}/review`)
      .send({ decision: 'approved' }).expect(403);
  });

  it('lets the technical authority decide, and records who', async () => {
    const decided = (await manager.put(`/api/v1/quality/material-approvals/${marId}/review`)
      .send({ decision: 'approved' }).expect(200)).body as Mar;
    expect(decided).toMatchObject({ status: 'approved', reviewedBy: 'mar-mgr' });
  });

  it('refuses the decider the act of raising one — they decide, they do not propose', async () => {
    await manager.post('/api/v1/quality/material-approvals').send({
      projectId, reference: 'MAR-AUTH-2', materialName: 'Self-proposed', supplier: 'Gulf Cables LLC',
    }).expect(403);
  });

  it('reloads the decision from the API, not from the response that wrote it', async () => {
    const reloaded = (await engineer.get(`/api/v1/quality/material-approvals?projectId=${projectId}`).expect(200)).body as Mar[];
    expect(reloaded.find((m) => m.reference === 'MAR-AUTH-1')).toMatchObject({
      status: 'approved', reviewedBy: 'mar-mgr',
    });
  });

  it('refuses an unauthenticated caller outright', async () => {
    await request(app.getHttpServer()).get('/api/v1/quality/material-approvals').expect(401);
  });
});
