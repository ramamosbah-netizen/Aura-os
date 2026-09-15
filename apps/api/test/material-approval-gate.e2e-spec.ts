// AURA OS — ENG-04: an approved material submittal, and what "approved" is allowed to mean.
//
// The Material Approval Request is the canonical record: the contractor proposes a product —
// manufacturer, supplier, specification — and the consultant approves it, approves it as noted, or
// rejects it BEFORE anything is bought or fixed to the building. That record was already sound.
//
// What the word "approved" meant was not. The procurement gate asked whether the supplier had a
// REJECTED request and passed whenever the answer was no, so a material nobody had ever submitted,
// and one still sitting with the consultant, issued a purchase order exactly like an approved one.
// Absence of a rejection was being read as approval.
//
// What is proven here:
//   · the request runs draft → submitted → decided, and the decision records WHO made it;
//   · an approved material lets a purchase order issue;
//   · a REJECTED one refuses it, and a PENDING one refuses it too — not yet approved is not approved;
//   · nothing on file reads as UNKNOWN and is carried onto the issue event rather than passing
//     invisibly, so "bought with no approval on file" is a fact somebody can answer for later;
//   · and a material submittal cannot be raised in the second, ungoverned register.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, TenantContext, UsersService } from '@aura/core';
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

describe('what an approved material submittal is allowed to mean (HTTP)', () => {
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
    for (const userId of ['mar-engineer', 'mar-consultant']) {
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
  const issue = (po: Po) =>
    http.patch(`/api/v1/procurement/purchase-orders/${po.id}/status`).send({ status: 'issued' });

  const raise = async (reference: string, supplier: string): Promise<Mar> =>
    (await http.post('/api/v1/quality/material-approvals').send({
      projectId, reference, materialName: 'FP200 Gold 2C 1.5mm', manufacturer: 'Prysmian', supplier,
    }).expect(201)).body as Mar;

  it('raises a material approval request as a draft, undecided and unattributed', async () => {
    const mar = await raise('MAR-001', 'Gulf Cables LLC');
    expect(mar).toMatchObject({ status: 'draft', revision: 0, reviewedBy: null, reviewedAt: null, reviewComments: '' });
  });

  it('REFUSES a purchase order while the material is only a draft — nobody has been asked', async () => {
    // The state that used to be indistinguishable from approval.
    const po = await orderFrom('Gulf Cables LLC', 'PO-DRAFT');
    const refused = await issue(po);
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/still in draft, never submitted/);
  });

  it('REFUSES it while the consultant is still holding it — not yet approved is not approved', async () => {
    const mars = (await http.get(`/api/v1/quality/material-approvals?projectId=${projectId}`).expect(200)).body as Mar[];
    const draft = mars.find((m) => m.reference === 'MAR-001')!;
    await http.put(`/api/v1/quality/material-approvals/${draft.id}/submit`).expect(200);

    const po = await orderFrom('Gulf Cables LLC', 'PO-PENDING');
    const refused = await issue(po);
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/awaiting the consultant/);
  });

  it('records WHO decided it when the consultant approves', async () => {
    const mars = (await http.get(`/api/v1/quality/material-approvals?projectId=${projectId}`).expect(200)).body as Mar[];
    const submitted = mars.find((m) => m.reference === 'MAR-001')!;
    const decided = (await http.put(`/api/v1/quality/material-approvals/${submitted.id}/review`)
      .set('x-e2e-actor', 'mar-consultant')
      .send({ decision: 'approved' }).expect(200)).body as Mar;
    expect(decided).toMatchObject({ status: 'approved', reviewedBy: 'mar-consultant' });
    expect(decided.reviewedAt).not.toBeNull();
  });

  it('lets the purchase order issue once the material is approved', async () => {
    const po = await orderFrom('Gulf Cables LLC', 'PO-APPROVED');
    const issued = await issue(po);
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    expect(issued.body.status).toBe('issued');
  });

  it('REFUSES one whose material the consultant rejected', async () => {
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

  it('reports a refusal sitting beside an approval, rather than the approval', async () => {
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

  it('lets an order through where nothing was ever submitted — and says so on the record', async () => {
    // UNKNOWN is permitted, because not every purchase needs a material approval: consumables,
    // hire and services do not. What it must never be is INVISIBLE, which is what it was.
    const po = await orderFrom('Office Supplies Co', 'PO-UNKNOWN');
    const issued = await issue(po);
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);

    const events = (await http.get('/api/v1/events?type=procurement.po.issued').expect(200)).body as
      Array<{ payload?: { supplier?: string; materialApproval?: { verdict: string | null; reason: string | null } } }>;
    const issuedEvent = events.find((event) => event.payload?.supplier === 'Office Supplies Co');
    expect(issuedEvent, 'the issue was not recorded').toBeDefined();
    expect(issuedEvent!.payload!.materialApproval).toMatchObject({ verdict: 'UNKNOWN' });
    expect(issuedEvent!.payload!.materialApproval!.reason).toMatch(/no material approval request exists/);
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
