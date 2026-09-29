import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * SEC-01 STAGE 4 — THE OWNER'S DECISIONS D-01…D-13 (2026-09-28), EACH WITH AN ALLOWED AND A FORBIDDEN ACTOR.
 *
 * Auth ON, the whole application, the SHIPPED role catalogue (seeded at boot) granted to one user per
 * role. For every changed authority the role the owner chose passes the permission gate and a relevant
 * other role is refused by it — "relevant" meaning the one that could plausibly have done it: the
 * preparer where a checker was chosen, the neighbouring engineer, the Store for the ELV register.
 *
 * The gate is proved on a fabricated id: the permission guard runs before the handler, so an allowed
 * actor reaches it (and gets 404 / 400 about the missing record) while a forbidden one never does
 * (403, "no grant satisfies"). Where a DOMAIN rule was added — the author may not review their own item,
 * the raiser may not answer their own RFI, a variation is submitted before it is decided and never by
 * its raiser — the rule is driven end to end on real records.
 *
 * D-09 (authority approvals), answered 2026-09-29, is proved last: who registers, runs, records and closes
 * a case, that a certificate no longer closes it, and that a submission never exists without evidence.
 */
const TENANT = 'sec01-decisions-tenant';
const ROLES = {
  finance: 'r-finance', controller: 'r-finance-controller', techMgr: 'r-technical-manager', techEng: 'r-technical-engineer',
  projEng: 'r-project-engineer', pm: 'r-pm', commercial: 'r-commercial-manager', commercial2: 'r-commercial-manager',
  planner: 'r-planning-engineer', site: 'r-site-engineer', tc: 'r-commissioning-engineer', store: 'r-store',
  docControl: 'r-document-controller', estimator: 'r-estimator', preSales: 'r-pre-sales', salesMgr: 'r-sales-manager',
  sales: 'r-sales', buyer: 'r-procurement', procMgr: 'r-procurement-manager',
  // Fixture identity only — builds the transmittal a submission cites; never an actor under test.
  admin: 'r-admin',
} as const;
type Actor = keyof typeof ROLES;

let app: INestApplication;
const token = {} as Record<Actor, string>;
const X = randomUUID();

const call = (actor: Actor, method: 'post' | 'put' | 'patch' | 'delete', path: string, body: object = {}) =>
  request(app.getHttpServer())[method](`/api/v1/${path}`).set('Authorization', `Bearer ${token[actor]}`).send(body);

async function allowed(actor: Actor, method: 'post' | 'put' | 'patch' | 'delete', path: string, body: object = {}) {
  const res = await call(actor, method, path, body);
  expect(res.status, `${actor} (${ROLES[actor]}) must pass the gate on ${method.toUpperCase()} ${path} — ${JSON.stringify(res.body)}`).not.toBe(403);
  expect(res.status).not.toBe(401);
  return res;
}
async function forbidden(actor: Actor, method: 'post' | 'put' | 'patch' | 'delete', path: string, body: object = {}) {
  const res = await call(actor, method, path, body);
  expect(res.status, `${actor} (${ROLES[actor]}) must be refused ${method.toUpperCase()} ${path}`).toBe(403);
  expect(String(res.body.message)).toMatch(/no grant satisfies/);
}

beforeAll(async () => {
  process.env.AUTH_JWT_SECRET = 'sec01-owner-decisions-secret';
  app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const auth = app.get(AuthService);
  const tenant = app.get(TenantContext);
  app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
    const context = await auth.contextFromHeader(req.headers.authorization);
    if (!context) { res.status(401).end(); return; }
    tenant.run(context, next);
  });
  await app.init();
  const access = app.get(AccessService);
  const users = app.get(UsersService);
  for (const [actor, roleId] of Object.entries(ROLES) as Array<[Actor, string]>) {
    const userId = `u-${actor}`;
    access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: TENANT } });
    users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    token[actor] = auth.mint({ sub: userId, tenantId: TENANT });
  }
}, 120_000);

afterAll(async () => { await app?.close(); });

describe('D-01…D-03 — Finance prepares; the Finance Controller reverses, files and releases', () => {
  it('payments, manual journals and reconciliation are Finance’s — not the controller’s', async () => {
    await allowed('finance', 'post', 'finance/payments', {});
    await forbidden('controller', 'post', 'finance/payments', {});
    await allowed('finance', 'post', 'finance/journals', {});
    await forbidden('controller', 'post', 'finance/journals', {});
    await allowed('finance', 'post', `finance/bank-transactions/${X}/reconcile`, {});
    await forbidden('controller', 'post', `finance/bank-transactions/${X}/reconcile`, {});
  });
  it('UN-reconciling is the controller’s, and Finance is refused it (D-01)', async () => {
    await allowed('controller', 'post', `finance/bank-transactions/${X}/unreconcile`, {});
    await forbidden('finance', 'post', `finance/bank-transactions/${X}/unreconcile`, {});
  });
  it('Finance generates a VAT return; only the controller records it filed or paid (D-02)', async () => {
    await allowed('finance', 'post', 'finance/vat-returns', {});
    await forbidden('controller', 'post', 'finance/vat-returns', {});
    await allowed('controller', 'patch', `finance/vat-returns/${X}/status`, { status: 'filed' });
    await forbidden('finance', 'patch', `finance/vat-returns/${X}/status`, { status: 'filed' });
  });
  it('guarantee status is the controller’s; cheque status stays Finance’s (D-03)', async () => {
    await allowed('controller', 'patch', `finance/bank-guarantees/${X}/status`, { status: 'released' });
    await forbidden('finance', 'patch', `finance/bank-guarantees/${X}/status`, { status: 'released' });
    await allowed('finance', 'patch', `finance/post-dated-cheques/${X}/status`, { status: 'deposited' });
    await forbidden('controller', 'patch', `finance/post-dated-cheques/${X}/status`, { status: 'deposited' });
  });
});

describe('D-04 / D-05 — engineering review is the Technical Manager’s, never on their own work', () => {
  it('each review and decision passes for the Technical Manager and is refused to the Technical Engineer', async () => {
    for (const [method, path, body] of [
      ['post', `engineering/drawings/${X}/start-review`, {}],
      ['post', `engineering/drawings/${X}/review`, { outcome: 'approved' }],
      ['put', `engineering/submittals/${X}/status`, { status: 'approved' }],
      ['put', `engineering/design-changes/${X}/decision`, { status: 'approved' }],
      ['put', `engineering/documents/${X}/transition`, { status: 'approved' }],
      ['put', `engineering/bim-models/${X}/version`, {}],
    ] as const) {
      await allowed('techMgr', method, path, body);
      await forbidden('techEng', method, path, body);
    }
  });

  it('RFI answers: the Project Engineer and the Technical Manager may; the Technical Engineer may not (D-05)', async () => {
    await allowed('projEng', 'put', `engineering/rfis/${X}/answer`, { answer: 'x' });
    await allowed('techMgr', 'put', `engineering/rfis/${X}/answer`, { answer: 'x' });
    await forbidden('techEng', 'put', `engineering/rfis/${X}/answer`, { answer: 'x' });
  });

  it('on real records: the TM may not review a drawing they wrote, and may review one the engineer wrote; the raiser may not answer their own RFI', async () => {
    const project = await call('pm', 'post', 'projects/projects', { title: `SEC-01 engineering ${X.slice(0, 6)}`, reference: `SE-${X.slice(0, 6)}`, value: 10_000 }).expect(201);
    const projectId = project.body.id as string;
    const own = await call('techMgr', 'post', 'engineering/drawings', { projectId, code: 'DWG-TM', title: 'TM drawing' }).expect(201);
    await call('techMgr', 'post', `engineering/drawings/${own.body.id}/submit`, {}).expect(201);
    const refused = await call('techMgr', 'post', `engineering/drawings/${own.body.id}/start-review`, {});
    expect(refused.status).toBe(403);
    expect(refused.body.message).toBe('the person who wrote or submitted this drawing may not review their own drawing');

    const theirs = await call('techEng', 'post', 'engineering/drawings', { projectId, code: 'DWG-TE', title: 'Engineer drawing' }).expect(201);
    await call('techEng', 'post', `engineering/drawings/${theirs.body.id}/submit`, {}).expect(201);
    const started = await call('techMgr', 'post', `engineering/drawings/${theirs.body.id}/start-review`, {});
    expect(started.status, JSON.stringify(started.body)).toBeLessThan(300);
    expect(started.body.status).toBe('under_review');

    const rfi = await call('projEng', 'post', 'engineering/rfis', { projectId, code: 'RFI-1', title: 'Riser', question: 'Which riser?' }).expect(201);
    const own2 = await call('projEng', 'put', `engineering/rfis/${rfi.body.id}/answer`, { answer: 'Riser B' });
    expect(own2.status).toBe(403);
    expect(own2.body.message).toBe('the person who raised this RFI may not answer their own RFI');
    const answered = await call('techMgr', 'put', `engineering/rfis/${rfi.body.id}/answer`, { answer: 'Riser B' });
    expect(answered.status, JSON.stringify(answered.body)).toBeLessThan(300);
    expect(answered.body.status).toBe('answered');
  });
});

describe('D-06 — the PM raises and submits; the Commercial Manager decides, never their own, never a draft', () => {
  it('drives a variation through the rule on real records', async () => {
    const project = await call('pm', 'post', 'projects/projects', { title: `SEC-01 variations ${X.slice(0, 6)}`, reference: `SV-${X.slice(0, 6)}`, value: 100_000 }).expect(201);
    const projectId = project.body.id as string;
    const vo = await call('pm', 'post', 'projects/variations', { projectId, title: 'Extra cameras', type: 'addition', amount: 12_000 }).expect(201);

    const early = await call('commercial', 'patch', `projects/variations/${vo.body.id}/status`, { status: 'approved' });
    expect(early.status, 'a draft is not decided').toBe(400);
    expect(early.body.message).toContain('cannot move variation from draft to approved');

    await call('pm', 'patch', `projects/variations/${vo.body.id}/status`, { status: 'submitted' }).expect(200);
    const pmApproves = await call('pm', 'patch', `projects/variations/${vo.body.id}/status`, { status: 'approved' });
    expect(pmApproves.status, 'the PM does not decide').toBe(403);
    expect(pmApproves.body.message).toMatch(/no grant satisfies "projects\.variation\.approve"/);
    const cmApproves = await call('commercial', 'patch', `projects/variations/${vo.body.id}/status`, { status: 'approved' }).expect(200);
    expect(cmApproves.body.status).toBe('approved');

    // A Commercial Manager who raised one may not decide it; a colleague may.
    const own = await call('commercial', 'post', 'projects/variations', { projectId, title: 'Omit two readers', type: 'omission', amount: 800 }).expect(201);
    await call('pm', 'patch', `projects/variations/${own.body.id}/status`, { status: 'submitted' }).expect(200);
    const self = await call('commercial', 'patch', `projects/variations/${own.body.id}/status`, { status: 'rejected' });
    expect(self.status).toBe(403);
    expect(self.body.message).toBe('the person who raised this variation may not decide their own variation');
    await call('commercial2', 'patch', `projects/variations/${own.body.id}/status`, { status: 'rejected' }).expect(200);
    // And the Commercial Manager does not SUBMIT — that is the PM's.
    const cmSubmit = await call('commercial', 'post', 'projects/variations', { projectId, title: 'Another', type: 'addition', amount: 10 }).expect(201);
    const refusedSubmit = await call('commercial', 'patch', `projects/variations/${cmSubmit.body.id}/status`, { status: 'submitted' });
    expect(refusedSubmit.status).toBe(403);
  });
});

describe('D-07 / D-08 — the PM’s lifecycle; the planner’s delays; commercial forecasts and billing maps', () => {
  it('closeout finalisation and delay status', async () => {
    await allowed('pm', 'post', `projects/closeouts/${X}/finalize`, {});
    await forbidden('projEng', 'post', `projects/closeouts/${X}/finalize`, {});
    await allowed('planner', 'patch', `projects/delays/${X}/status`, { status: 'resolved' });
    await allowed('pm', 'patch', `projects/delays/${X}/status`, { status: 'resolved' });
    await forbidden('site', 'patch', `projects/delays/${X}/status`, { status: 'resolved' });
  });
  it('project status and the WBS baseline are the PM’s; the planner prepares but does not approve', async () => {
    await allowed('pm', 'patch', `projects/projects/${X}/status`, { status: 'active' });
    await forbidden('planner', 'patch', `projects/projects/${X}/status`, { status: 'active' });
    await allowed('pm', 'post', `projects/projects/${X}/wbs-baseline`, {});
    await forbidden('planner', 'post', `projects/projects/${X}/wbs-baseline`, {});
  });
  it('cash-flow forecasts: PM and Commercial; billing item maps: Commercial / QS', async () => {
    await allowed('pm', 'post', 'projects/cashflow-forecasts', {});
    await allowed('commercial', 'post', 'projects/cashflow-forecasts', {});
    await forbidden('finance', 'post', 'projects/cashflow-forecasts', {});
    await allowed('commercial', 'post', 'projects/delivery-item-maps', {});
    await forbidden('pm', 'post', 'projects/delivery-item-maps', {});
  });
});

describe('D-10…D-12 — devices, generic documents, estimating', () => {
  it('engineering registers ELV devices; T&C owns status and commissioning; the Store does neither', async () => {
    await allowed('techEng', 'post', 'elv/devices', {});
    await allowed('projEng', 'post', 'elv/devices', {});
    await forbidden('store', 'post', 'elv/devices', {});
    await allowed('techEng', 'patch', `elv/devices/${X}`, {});
    await forbidden('store', 'patch', `elv/devices/${X}`, {});
    await allowed('tc', 'put', `elv/devices/${X}/status`, { status: 'installed' });
    await forbidden('techEng', 'put', `elv/devices/${X}/status`, { status: 'installed' });
    await allowed('tc', 'put', `elv/devices/${X}/commissioning`, {});
    await forbidden('store', 'put', `elv/devices/${X}/commissioning`, {});
  });
  it('the generic document routes are the Document Controller’s — on a real document', async () => {
    // A real document: the document service answers an unknown id with its own 403 (it does not say
    // whether a document exists), so a fabricated id cannot show the gate here. Per-document rights
    // still apply on top of the route permission; the controller is this document's owner.
    const doc = { kind: 'report', title: 'Controlled note', aggregateType: 'crm.lead', aggregateId: 'lead-sec01', fileName: 'note.txt', contentType: 'text/plain', content: 'controlled note v1' };
    const created = await call('docControl', 'post', 'documents', doc);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    await forbidden('site', 'post', 'documents', doc);
    const id = (created.body.document?.id ?? created.body.id) as string;

    const version = { fileName: 'note.txt', contentType: 'text/plain', content: 'controlled note v2' };
    expect((await call('docControl', 'post', `documents/${id}/versions`, version)).status).toBeLessThan(300);
    await forbidden('site', 'post', `documents/${id}/versions`, version);

    const share = { subjectType: 'USER', subjectId: 'u-site', permission: 'VIEW' };
    const shared = await call('docControl', 'post', `documents/${id}/share`, share);
    expect(shared.status, JSON.stringify(shared.body)).toBeLessThan(300);
    await forbidden('site', 'post', `documents/${id}/share`, share);
    const permissionId = (shared.body.id ?? shared.body.permission?.id) as string;
    await forbidden('site', 'delete', `documents/${id}/permissions/${permissionId}`);
    expect((await call('docControl', 'delete', `documents/${id}/permissions/${permissionId}`)).status).toBeLessThan(300);
  });
  it('line estimates and pricing sources; calibration and AI completion stay administration', async () => {
    await allowed('estimator', 'post', 'estimation/line', {});
    await forbidden('preSales', 'post', 'estimation/line', {});
    await allowed('estimator', 'post', 'intelligence/pricing-sources', {});
    await allowed('procMgr', 'post', 'intelligence/pricing-sources', {});
    await forbidden('buyer', 'post', 'intelligence/pricing-sources', {});
    await forbidden('estimator', 'post', 'intelligence/calibrations/trigger', {});
    await forbidden('estimator', 'post', 'ai/complete', {});
  });
});

describe('D-13 — the Estimator prices, Pre-Sales scopes, the Sales Manager keeps the package, override and policy', () => {
  const pkg = `crm/opportunities/${X}/pre-award-package`;
  it('estimate, build-ups and pricing: the Estimator; not Pre-Sales', async () => {
    for (const [method, path] of [
      ['post', `${pkg}/estimate`], ['patch', `${pkg}/estimate/${X}/build-ups`],
      ['post', `${pkg}/pricing/open`], ['post', `${pkg}/pricing/revision`], ['post', `${pkg}/pricing/preview`],
    ] as const) {
      await allowed('estimator', method, path, {});
      await forbidden('preSales', method, path, {});
    }
  });
  it('scope and scope lines: Pre-Sales; not the Estimator', async () => {
    await allowed('preSales', 'post', `${pkg}/scope`, { lines: [] });
    await forbidden('estimator', 'post', `${pkg}/scope`, { lines: [] });
    await allowed('preSales', 'patch', `${pkg}/scope/${X}/lines`, { lines: [] });
    await forbidden('estimator', 'patch', `${pkg}/scope/${X}/lines`, { lines: [] });
  });
  it('pricing policy, outcome override and opening the package stay the Sales Manager’s', async () => {
    await allowed('salesMgr', 'patch', `${pkg}/pricing/${X}/policy`, { method: 'target_margin', percent: 20 });
    await forbidden('estimator', 'patch', `${pkg}/pricing/${X}/policy`, { method: 'target_margin', percent: 20 });
    await allowed('salesMgr', 'post', `crm/opportunities/${X}/outcome/override`, {});
    await forbidden('sales', 'post', `crm/opportunities/${X}/outcome/override`, {});
    await allowed('salesMgr', 'post', `${pkg}/open`, {});
    await forbidden('estimator', 'post', `${pkg}/open`, {});
  });
});

describe('D-09 — authority approvals: registered by the engineer or document control, run and CLOSED by the PM or engineer', () => {
  let projectId = '';
  const code = `DCD-${X.slice(0, 6).toUpperCase()}`;
  const openCase = (actor: Actor) => call(actor, 'post', 'compliance/cases', {
    authorityCode: code, obligationCode: 'FIRE_ALARM_NOC', scope: 'PROJECT', subjectId: projectId, projectId, system: 'fire alarm',
  });
  const status = async (caseId: string) =>
    (await request(app.getHttpServer()).get(`/api/v1/compliance/cases/${caseId}`).set('Authorization', `Bearer ${token.pm}`).expect(200)).body.status as string;
  const storedReceipt = async (caseId: string, text: string) => {
    const doc = await call('docControl', 'post', 'documents', {
      kind: 'report', title: 'Authority portal receipt', aggregateType: 'compliance.case', aggregateId: caseId,
      fileName: 'receipt.txt', contentType: 'text/plain', content: text,
    }).expect(201);
    return (doc.body.document?.id ?? doc.body.id) as string;
  };

  beforeAll(async () => {
    projectId = (await call('pm', 'post', 'projects/projects', { title: `SEC-01 D-09 ${X.slice(0, 6)}`, reference: `SD9-${X.slice(0, 6)}`, value: 50_000 }).expect(201)).body.id;
  });

  it('registering an authority and opening a case: the Project Engineer and Document Controller may; the PM and Site may not', async () => {
    expect((await call('projEng', 'post', 'compliance/authorities', { code, name: 'Dubai Civil Defence', jurisdiction: 'Dubai' })).status).toBe(201);
    expect((await call('docControl', 'post', 'compliance/authorities', { code: `${code}-B`, name: 'SIRA', jurisdiction: 'Dubai' })).status).toBe(201);
    await forbidden('pm', 'post', 'compliance/authorities', { code: `${code}-C`, name: 'x', jurisdiction: 'Dubai' });
    await forbidden('site', 'post', 'compliance/authorities', { code: `${code}-D`, name: 'x', jurisdiction: 'Dubai' });
    expect((await openCase('projEng')).status).toBe(201);
    expect((await openCase('docControl')).status).toBe(201);
    const pmOpen = await openCase('pm');
    expect(pmOpen.status, 'the PM has oversight, not registration').toBe(403);
  });

  it('a submission never exists without evidence — a portal needs its receipt and reference, a package its SENT transmittal', async () => {
    const kase = (await openCase('docControl').expect(201)).body.id as string;
    const portal = { submittedAt: '2026-09-29', method: 'authority_portal' };

    expect((await call('docControl', 'post', `compliance/cases/${kase}/submissions`, { submittedAt: '2026-09-29' })).status, 'no method, no evidence').toBe(400);
    const noReceipt = await call('docControl', 'post', `compliance/cases/${kase}/submissions`, { ...portal, reference: 'DCD-PORTAL-1' });
    expect(noReceipt.status).toBe(400);
    expect(noReceipt.body.message).toContain('must never exist without evidence');
    const fakeReceipt = await call('docControl', 'post', `compliance/cases/${kase}/submissions`, { ...portal, reference: 'DCD-PORTAL-1', evidenceDocumentId: randomUUID() });
    expect(fakeReceipt.status, 'an id that is not a stored document proves nothing').toBe(400);
    expect(fakeReceipt.body.message).toContain('the submission evidence is invalid');

    const receiptId = await storedReceipt(kase, 'Portal submission DCD-PORTAL-1 received');
    await forbidden('pm', 'post', `compliance/cases/${kase}/submissions`, { ...portal, reference: 'DCD-PORTAL-1', evidenceDocumentId: receiptId });
    const recorded = await call('docControl', 'post', `compliance/cases/${kase}/submissions`, { ...portal, reference: 'DCD-PORTAL-1', evidenceDocumentId: receiptId });
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(201);
    expect(recorded.body).toMatchObject({ method: 'authority_portal', evidenceDocumentId: receiptId, reference: 'DCD-PORTAL-1' });
    expect(await status(kase)).toBe('submitted');

    // A controlled package: the transmittal must exist AND have been sent.
    const second = (await openCase('projEng').expect(201)).body.id as string;
    const entry = (await call('admin', 'post', 'doccontrol/register', { projectId, documentNumber: `FA-${X.slice(0, 4)}`, title: 'Fire alarm layout', discipline: 'elv' }).expect(201)).body.id as string;
    const tr = (await call('admin', 'post', 'doccontrol/transmittals', { projectId, code: `TR-D9-${X.slice(0, 6)}`, title: 'NOC submission', sender: 'Document Control', recipient: 'Dubai Civil Defence', purpose: 'For Approval' }).expect(201)).body.id as string;
    await call('admin', 'post', `doccontrol/transmittals/${tr}/items`, { items: [{ registerEntryId: entry, revision: 'A', purpose: 'for_approval' }] }).expect(201);
    const draftCited = await call('projEng', 'post', `compliance/cases/${second}/submissions`, { submittedAt: '2026-09-29', method: 'controlled_package', transmittalId: tr });
    expect(draftCited.status).toBe(400);
    expect(draftCited.body.message).toContain('is still a draft');
    await call('admin', 'post', `doccontrol/transmittals/${tr}/recipients`, { userId: 'u-projEng', party: 'other' }).expect(201);
    const sent = await call('admin', 'post', `doccontrol/transmittals/${tr}/send`, {});
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    const packaged = await call('projEng', 'post', `compliance/cases/${second}/submissions`, { submittedAt: '2026-09-29', method: 'controlled_package', transmittalId: tr });
    expect(packaged.status, JSON.stringify(packaged.body)).toBe(201);
    expect(packaged.body).toMatchObject({ method: 'controlled_package', transmittalId: tr, evidenceDocumentId: null });
  });

  it('a certificate is RECEIVED, not closed; only the PM or Project Engineer confirms closure, and only on a received certificate', async () => {
    const kase = (await openCase('projEng').expect(201)).body.id as string;
    const receiptId = await storedReceipt(kase, 'receipt P-2');
    await call('docControl', 'post', `compliance/cases/${kase}/submissions`, { submittedAt: '2026-09-29', method: 'authority_portal', reference: 'P-2', evidenceDocumentId: receiptId }).expect(201);

    const early = await call('docControl', 'post', `compliance/cases/${kase}/certificates`, { number: 'NOC-0', issuedAt: '2026-09-29' });
    expect(early.status, 'a certificate follows an approval').toBe(409);
    expect(early.body.message).toContain('a certificate can only be recorded on an approved case');

    await forbidden('docControl', 'post', `compliance/cases/${kase}/decisions`, { outcome: 'approved', decisionDate: '2026-09-29' });
    await call('pm', 'post', `compliance/cases/${kase}/decisions`, { outcome: 'approved', decisionDate: '2026-09-29' }).expect(201);
    expect(await status(kase)).toBe('approved');

    const skip = await call('pm', 'put', `compliance/cases/${kase}/status`, { status: 'certified' });
    expect(skip.status, 'approved never jumps to closed').toBe(409);
    const claimed = await call('projEng', 'put', `compliance/cases/${kase}/status`, { status: 'certificate_received' });
    expect(claimed.status).toBe(409);
    expect(claimed.body.message).toBe('a case can only reach certificate received by recording its certificate');

    await forbidden('projEng', 'post', `compliance/cases/${kase}/certificates`, { number: 'NOC-1', issuedAt: '2026-09-29' });
    await call('docControl', 'post', `compliance/cases/${kase}/certificates`, { number: 'NOC-1', issuedAt: '2026-09-29', expiresAt: '2027-09-29' }).expect(201);
    expect(await status(kase), 'recording the certificate does NOT close the case').toBe('certificate_received');

    await forbidden('docControl', 'put', `compliance/cases/${kase}/status`, { status: 'certified' });
    const closed = await call('pm', 'put', `compliance/cases/${kase}/status`, { status: 'certified' });
    expect(closed.status, JSON.stringify(closed.body)).toBe(200);
    expect(closed.body.status).toBe('certified');
  });

  it('inspections and their outcomes are the PM’s and the engineer’s — not document control’s', async () => {
    const kase = (await openCase('projEng').expect(201)).body.id as string;
    await forbidden('docControl', 'post', `compliance/cases/${kase}/inspections`, {});
    const inspection = await call('projEng', 'post', `compliance/cases/${kase}/inspections`, { scheduledAt: '2026-10-05' }).expect(201);
    await forbidden('docControl', 'put', `compliance/inspections/${inspection.body.id}/outcome`, { outcome: 'pass', conductedAt: '2026-10-05' });
    await call('pm', 'put', `compliance/inspections/${inspection.body.id}/outcome`, { outcome: 'pass', conductedAt: '2026-10-05' }).expect(200);
  });
});
