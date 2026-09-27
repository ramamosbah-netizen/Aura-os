import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

/**
 * EST-17 — the quotation approval policy is company configuration, enforced on the server.
 * Contract proof with Auth ON (every route guarded as in production), in-memory stores.
 *
 *   an Admin starts from the owner's defaults; validation refuses them as they stand (the Executive
 *   amount is the owner's to set, and two roles cannot approve until an administrator grants it);
 *   the Admin sets a TEST amount, the administrator grants approval authority explicitly, the
 *   version is activated with a reason, and every change is logged with before and after;
 *   offers submitted afterwards follow it — in sequence, with segregation of duties and limits;
 *   a new version applies only to approvals started after it; manual quotes are refused;
 *   another tenant sees none of it; a non-Admin cannot touch it; retiring it restores one step.
 */
it('EST-17: an Admin changes the quotation approval policy and later offers follow it, without a deployment', async () => {
  const previous = process.env.AUTH_JWT_SECRET;
  process.env.AUTH_JWT_SECRET = 'isolated-est17-secret';
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
  app.useGlobalFilters(new AllExceptionsFilter());
  const auth = app.get(AuthService);
  const tenant = app.get(TenantContext);
  const access = app.get(AccessService);
  app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
    const context = await auth.contextFromHeader(req.headers.authorization);
    if (!context) { res.status(401).end(); return; }
    tenant.run(context, next);
  });
  await app.init();
  try {
    expect(auth.enabled).toBe(true);
    const tenantId = 'est17-tenant';
    const users = app.get(UsersService);
    const seat = (userId: string, roleId: string, attributes?: { approvalLimit?: number }, t = tenantId) => {
      access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: t }, ...(attributes ? { attributes } : {}) });
      users.save({ tenantId: t, userId, displayName: userId, active: true });
    };
    for (const [userId, roleId] of [
      ['est17-admin', 'r-admin'], ['est17-preparer', 'r-commercial-manager'], ['est17-tm', 'r-technical-manager'],
      ['est17-cm', 'r-commercial-manager'], ['est17-sm', 'r-sales-manager'], ['est17-exec', 'r-executive'],
    ]) seat(userId, roleId);
    // A second Sales Manager whose grant carries an approval limit of 1,000.
    seat('est17-sm-limited', 'r-sales-manager', { approvalLimit: 1_000 });
    const client = (userId: string, t = tenantId) => {
      const c = request.agent(app.getHttpServer());
      c.set('Authorization', `Bearer ${auth.mint({ sub: userId, tenantId: t })}`);
      return c;
    };
    const admin = client('est17-admin');
    const base = '/api/v1/admin/company-policies/quotation-approval';

    // ── The owner's defaults, as a draft; validation refuses them as they stand ───────────────────
    const empty = (await admin.get(base).expect(200)).body;
    expect(empty.active).toBeNull();
    expect(empty.ownerDefault.steps.map((s: { role: string }) => s.role)).toEqual(['r-technical-manager', 'r-commercial-manager', 'r-sales-manager', 'r-executive']);
    const v1 = (await admin.post(`${base}/drafts`).send({ reason: "Adopt the owner's defaults of 2026-09-27", from: 'owner-default' }).expect(201)).body;
    expect(v1).toMatchObject({ version: 1, status: 'draft' });
    const first = (await admin.post(`${base}/validate`).send({ body: v1.body }).expect(201)).body.issues as Array<{ severity: string; code: string; message: string }>;
    expect(first.filter((i) => i.severity === 'error').map((i) => i.code).sort()).toEqual(['pending-decision', 'unauthorised-approver', 'unauthorised-approver']);
    expect((await admin.post(`${base}/drafts/1/activate`).send({ reason: 'try it' })).status, 'an unvalidated draft cannot be activated').toBe(400);

    // The administrator grants approval authority EXPLICITLY — the policy never does.
    access.registerRole({ id: 'est17-quotation-approver', name: 'Quotation approver', permissions: ['crm.quotation.read', 'crm.quotation.approve'] });
    for (const userId of ['est17-tm', 'est17-exec']) access.grant({ userId, roleId: 'est17-quotation-approver', scope: { kind: 'org', level: 'tenant', id: tenantId } });

    // The Admin enters a TEST amount for the Executive tier (the owner's own amount is still pending).
    const withAmount = { ...v1.body, steps: v1.body.steps.map((s: { id: string }) => (s.id === 'executive' ? { ...s, appliesAbove: 500_000, pendingDecision: null } : s)) };
    const noReason = await admin.put(`${base}/drafts/1`).send({ body: withAmount, reason: '' });
    expect(noReason.status, 'a change without a reason is refused').toBe(400);
    await admin.put(`${base}/drafts/1`).send({ body: withAmount, reason: 'Test amount for the contract proof' }).expect(200);
    expect(((await admin.post(`${base}/validate`).send({ body: withAmount }).expect(201)).body.issues as Array<{ severity: string }>).filter((i) => i.severity === 'error')).toEqual([]);
    const preview = (await admin.post(`${base}/preview`).send({ body: withAmount, offer: { net: 600_000, gross: 630_000 } }).expect(201)).body;
    expect(preview.plan.steps.map((s: { id: string }) => s.id)).toEqual(['technical', 'commercial', 'sales', 'executive']);

    // Offers raised BEFORE activation (a manual quote is still allowed then).
    const preparer = client('est17-preparer');
    const offer = async (name: string, unitPrice: number) => (await preparer.post('/api/v1/crm/quotations').send({
      customerName: name, issueDate: '2026-09-27', lines: [{ description: 'IP camera', quantity: 10, unit: 'no', unitPrice, vatRate: 5 }],
    }).expect(201)).body as { id: string; quoteNumber: string };
    const A = await offer('Offer A', 10_000);   // net 100,000
    const B = await offer('Offer B', 10_000);
    const C = await offer('Offer C', 10_000);
    const ready = async (id: string) => {
      const rows = (await admin.post('/api/v1/document-requirements/seed').send({ entityType: 'crm.quotation', entityId: id }).expect(201)).body as Array<{ id: string; status: string }>;
      for (const row of rows) if (row.status === 'REQUIRED') await client('est17-cm').post(`/api/v1/document-requirements/${row.id}/waive`).send({ reason: 'EST-17 proof: evidence not under test' }).expect(201);
    };
    for (const q of [A, B, C]) await ready(q.id);

    await admin.post(`${base}/drafts/1/activate`).send({ reason: 'Owner defaults with the test amount' }).expect(201);
    const log = (await admin.get(base).expect(200)).body;
    expect(log.active).toMatchObject({ version: 1, status: 'active', activatedBy: 'est17-admin' });
    expect(log.changes.map((c: { action: string; actorId: string; reason: string }) => [c.action, c.actorId, c.reason])).toEqual([
      ['draft_created', 'est17-admin', "Adopt the owner's defaults of 2026-09-27"],
      ['draft_updated', 'est17-admin', 'Test amount for the contract proof'],
      ['activated', 'est17-admin', 'Owner defaults with the test amount'],
    ]);
    expect(log.changes[1].previous.steps[3].pendingDecision).toContain('owner');
    expect(log.changes[1].next.steps[3].appliesAbove).toBe(500_000);

    // ── A manual quote is refused under the active policy ─────────────────────────────────────────
    const manual = await preparer.post('/api/v1/crm/quotations').send({ customerName: 'Manual', issueDate: '2026-09-27', lines: [{ description: 'x', quantity: 1, unitPrice: 1, vatRate: 5 }] });
    expect(manual.status).toBe(409);
    expect(manual.body.message).toContain('forbids manual quotations for new deals');
    // …and on the two other ways round the study, estimate and pricing: converting an ungoverned deal,
    // and quoting it from an approved solution scope.
    const salesManager = client('est17-sm');
    const deal = (await salesManager.post('/api/v1/crm/opportunities').send({ title: 'EST-17 legacy deal', value: 80_000, executionType: 'direct_sale', accountName: 'Legacy Co' }).expect(201)).body as { id: string };
    const converted = await salesManager.post(`/api/v1/crm/opportunities/${deal.id}/convert-to-quotation`);
    expect(converted.status, 'an ungoverned deal is not converted into a manual quote').toBe(409);
    expect(converted.body.message).toContain('forbids manual quotations for new deals');
    const scope = (await admin.post(`/api/v1/crm/opportunities/${deal.id}/scopes`).send({ title: 'EST-17 scope', lines: [{ description: 'IP camera', quantity: 4, unit: 'no' }] }).expect(201)).body as { id: string };
    await client('est17-tm').post(`/api/v1/crm/opportunities/${deal.id}/scopes/${scope.id}/approve`).expect(201);
    const fromScope = await salesManager.post(`/api/v1/crm/opportunities/${deal.id}/scopes/${scope.id}/generate-quotation`).send({ customerName: 'Legacy Co' });
    expect(fromScope.status, 'an approved solution scope is not quoted around the chain').toBe(409);
    expect(fromScope.body.message).toContain('forbids manual quotations for new deals');

    // ── Offer A follows version 1: in sequence, with segregation of duties and approval limits ────
    const act = (userId: string, id: string, action: string) => client(userId).patch(`/api/v1/crm/quotations/${id}/status`).send({ action });
    expect((await act('est17-preparer', A.id, 'approve')).status, 'under a policy an offer is approved in steps, after review').toBe(409);
    await act('est17-preparer', A.id, 'submit_review').expect(200);
    await act('est17-preparer', B.id, 'submit_review').expect(200);
    const outOfTurn = await act('est17-sm', A.id, 'approve');
    expect(outOfTurn.status, 'the Sales Manager cannot approve before the Technical Manager').toBe(403);
    expect(outOfTurn.body.message).toContain('waiting on Technical Manager (r-technical-manager)');
    expect((await act('est17-tm', A.id, 'approve').expect(200)).body.status).toBe('internal_review');
    const twice = await act('est17-tm', A.id, 'approve');
    expect(twice.status, 'one person approves one step').toBe(403);
    expect(twice.body.message).toContain('has already approved the Technical Manager step');
    const own = await act('est17-preparer', A.id, 'approve');
    expect(own.status, 'the preparer cannot approve their own offer').toBe(403);
    expect(own.body.message).toContain('cannot approve their own quotation');
    await act('est17-cm', A.id, 'approve').expect(200);
    const limited = await act('est17-sm-limited', A.id, 'approve');
    expect(limited.status, 'a role holder above their approval limit is refused').toBe(403);
    expect(limited.body.message).toContain('above your approval limit');
    expect((await act('est17-sm', A.id, 'approve').expect(200)).body.status).toBe('approved');
    const statusA = (await admin.get(`/api/v1/crm/quotations/${A.id}/approval`).expect(200)).body;
    expect(statusA.runs[0]).toMatchObject({ policyVersion: 1, status: 'completed', amount: 100_000, amountBasis: 'net' });
    expect(statusA.runs[0].steps.map((s: { id: string; decisions: Array<{ approverId: string }> }) => [s.id, s.decisions.map((d) => d.approverId)])).toEqual([
      ['technical', ['est17-tm']], ['commercial', ['est17-cm']], ['sales', ['est17-sm']],
    ]);

    // ── Version 2 lowers the Executive amount; B (already started) keeps version 1, C follows 2 ───
    const v2 = (await admin.post(`${base}/drafts`).send({ reason: 'Executive to see offers above 50,000' }).expect(201)).body;
    expect(v2).toMatchObject({ version: 2, status: 'draft' });
    const lower = { ...v2.body, steps: v2.body.steps.map((s: { id: string }) => (s.id === 'executive' ? { ...s, appliesAbove: 50_000 } : s)) };
    await admin.put(`${base}/drafts/2`).send({ body: lower, reason: 'Lower the Executive amount' }).expect(200);
    await admin.post(`${base}/drafts/2/activate`).send({ reason: 'Tighter control for the proof' }).expect(201);
    expect((await admin.put(`${base}/drafts/1`).send({ body: lower, reason: 'rewrite history' })).status, 'a retired version cannot be edited').toBe(409);

    for (const u of ['est17-tm', 'est17-cm']) await act(u, B.id, 'approve').expect(200);
    expect((await act('est17-sm', B.id, 'approve').expect(200)).body.status, 'B keeps version 1: no Executive step').toBe('approved');

    await act('est17-preparer', C.id, 'submit_review').expect(200);
    for (const u of ['est17-tm', 'est17-cm', 'est17-sm']) await act(u, C.id, 'approve').expect(200);
    const statusC = (await admin.get(`/api/v1/crm/quotations/${C.id}/approval`).expect(200)).body;
    expect(statusC.runs[0]).toMatchObject({ policyVersion: 2, status: 'open' });
    expect(statusC.runs[0].waitingOn.map((s: { id: string }) => s.id)).toEqual(['executive']);
    expect((await act('est17-exec', C.id, 'approve').expect(200)).body.status, 'C follows version 2: the Executive approves last').toBe('approved');

    // ── Isolation and authority over the policy itself ────────────────────────────────────────────
    seat('est17-foreign-admin', 'r-admin', undefined, 'est17-foreign');
    const foreign = (await client('est17-foreign-admin', 'est17-foreign').get(base).expect(200)).body;
    expect(foreign.active, 'another tenant sees none of it').toBeNull();
    expect(foreign.versions).toEqual([]);
    expect((await client('est17-sm').get(base)).status, 'a Sales Manager cannot read or change company policy').toBe(403);

    // ── Retiring it restores a single approval for offers started afterwards ──────────────────────
    await admin.post(`${base}/retire`).send({ reason: 'End of the contract proof' }).expect(201);
    expect((await admin.get(base).expect(200)).body.active).toBeNull();
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.AUTH_JWT_SECRET; else process.env.AUTH_JWT_SECRET = previous;
  }
}, 120_000);
