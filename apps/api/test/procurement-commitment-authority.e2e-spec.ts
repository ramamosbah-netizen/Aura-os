// Procurement commitments — over HTTP, Auth-ON.
//
// THE QUESTION THIS SPEC EXISTS TO ANSWER: who committed this business to a supplier, and who was
// even allowed to send the enquiry?
//
// Before this change the Buyer held `procurement.*.read`, `procurement.*.create` and
// `procurement.*.update` — three MIDDLE WILDCARDS, which define authority by the shape of the verb
// rather than by what the act is. Measured against the running API, the Buyer could create anything
// in the module and was refused every act whose verb was something else:
//
//   403  PATCH procurement/rfqs/:id/send                        sending the enquiry IS the job
//   403  POST  procurement/framework-agreements/:id/activate
//   403  POST  procurement/framework-agreements/:id/call-offs   routine drawdown
//
// The Procurement Manager held `procurement.*`, covering the routine work and the acts that commit
// the business alike. No role NAMED any of them.
//
// And a framework agreement is a blanket commitment: activating one binds this business up to its
// ceiling, and both transitions wrote `actorId: null`, because the actor never reached the service.
//
// Two principals, both on unmodified shipped roles:
//   buyer    r-procurement          runs the enquiry cycle and draws down; commits nothing
//   procmgr  r-procurement-manager  puts a ceiling in force and ends it
//
// NOT TOUCHED: the sourcing decision. SUP-13/SUP-14 are closed to new scope under ADR-0022.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `proc-e2e-${Date.now()}`;

interface Agreement {
  id: string; status: string; ceilingValue: number; calledOffValue: number;
  createdBy: string | null; activatedBy: string | null; activatedAt: string | null;
  terminatedBy: string | null;
}
interface RfqBody { id: string; status: string; sentBy: string | null; sentAt: string | null; createdBy: string | null }

describe('procurement commitments — the Buyer runs the cycle, the manager commits (HTTP, Auth-ON)', () => {
  let app: INestApplication;
  let buyer: ReturnType<typeof request.agent>;
  let procmgr: ReturnType<typeof request.agent>;
  /**
   * ONE PERSON HOLDING BOTH ROLES. On a small contractor the Buyer and the Procurement Manager are
   * frequently the same human, and that is a legitimate arrangement no permission can refuse — which
   * is precisely why the domain rule exists on top of the authority split.
   */
  let both: ReturnType<typeof request.agent>;
  let supplierId: string;
  let n = 0;

  const post = async <T>(a: ReturnType<typeof request.agent>, path: string, data?: unknown): Promise<T> => {
    const res = await a.post(path).send(data ?? {});
    expect(res.ok, `${path} — ${res.status} ${JSON.stringify(res.body)}`).toBe(true);
    return res.body as T;
  };
  const draftAgreement = (a = buyer) => post<Agreement>(a, '/api/v1/procurement/framework-agreements', {
    title: `Cable rate card ${++n}`, supplierId, validFrom: '2026-01-01', validTo: '2026-12-31', ceilingValue: 1_000_000,
  });

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'procurement-commitment-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());

    const auth = app.get(AuthService);
    const access = app.get(AccessService);
    const users = app.get(UsersService);
    for (const [userId, roleId] of [
      ['proc-buyer', 'r-procurement'], ['proc-mgr', 'r-procurement-manager'],
      ['proc-both', 'r-procurement'], ['proc-both', 'r-procurement-manager'],
    ] as const) {
      access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: TENANT }, attributes: { approvalLimit: 10_000_000 } });
      users.save({ tenantId: TENANT, userId, displayName: userId, active: true });
    }

    const tenant = app.get(TenantContext);
    app.use(async (req: { headers: { authorization?: string } }, res: { status: (n: number) => { end: () => void } }, next: () => void) => {
      const context = await auth.contextFromHeader(req.headers.authorization);
      if (!context) { res.status(401).end(); return; }
      tenant.run(context, next);
    });
    await app.init();
    expect(auth.enabled, 'this spec is worthless with auth off — the guard would never run').toBe(true);

    const server = app.getHttpServer();
    const agent = (sub: string) => request.agent(server).set('Authorization', `Bearer ${auth.mint({ sub, tenantId: TENANT })}`);
    buyer = agent('proc-buyer'); procmgr = agent('proc-mgr'); both = agent('proc-both');

    const supplier = await post<{ id: string }>(buyer, '/api/v1/procurement/suppliers', {
      code: `SUP-${Date.now()}`, name: 'Gulf Cables LLC',
    });
    supplierId = supplier.id;
    // A framework agreement requires an APPROVED supplier, and admitting a vendor to the master is
    // `procurement.supplier.status` — the manager's, not the Buyer's. The split shows up here before
    // any assertion does: the Buyer creates the supplier record, somebody else says it may be traded
    // with.
    expect((await buyer.patch(`/api/v1/procurement/suppliers/${supplierId}/status`).send({ action: 'approve' })).status).toBe(403);
    await procmgr.patch(`/api/v1/procurement/suppliers/${supplierId}/status`).send({ action: 'approve' }).expect(200);
  });

  afterAll(async () => { await app?.close(); });

  it('lets the Buyer send the enquiry — the act the role was refused', async () => {
    const pr = await post<{ id: string }>(buyer, '/api/v1/procurement/purchase-requests', { title: 'Cables', value: 0 });
    const rfq = await post<RfqBody>(buyer, '/api/v1/procurement/rfqs', { title: 'Cables RFQ', prId: pr.id });
    expect(rfq).toMatchObject({ status: 'draft', createdBy: 'proc-buyer', sentBy: null });

    const sent = await buyer.patch(`/api/v1/procurement/rfqs/${rfq.id}/send`).send({});
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body).toMatchObject({ status: 'sent', sentBy: 'proc-buyer' });
    expect(sent.body.sentAt, 'the rfqSent event carried a null actor and the row held nothing').not.toBeNull();

    // SENDING IT TWICE is refused — it used to re-stamp the status and emit a second event.
    const again = await buyer.patch(`/api/v1/procurement/rfqs/${rfq.id}/send`).send({});
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/only a draft RFQ can be sent/);
  });

  it('refuses the Buyer the commitment, and the negotiator their own activation', async () => {
    const fa = await draftAgreement();
    expect(fa).toMatchObject({ status: 'draft', ceilingValue: 1_000_000, createdBy: 'proc-buyer' });

    // AUTHORITY LAYER. Putting a ceiling in force is not the Buyer's.
    expect((await buyer.post(`/api/v1/procurement/framework-agreements/${fa.id}/activate`).send({})).status).toBe(403);
    expect((await buyer.post(`/api/v1/procurement/framework-agreements/${fa.id}/terminate`).send({})).status).toBe(403);

    const active = await post<Agreement>(procmgr, `/api/v1/procurement/framework-agreements/${fa.id}/activate`);
    expect(active).toMatchObject({ status: 'active', createdBy: 'proc-buyer', activatedBy: 'proc-mgr' });
    expect(active.activatedAt).not.toBeNull();

    // AT THE AUTHORITY LAYER the split is already complete: the manager cannot even negotiate one.
    expect((await procmgr.post('/api/v1/procurement/framework-agreements').send({
      title: 'by the manager', supplierId, validFrom: '2026-01-01', validTo: '2026-12-31', ceilingValue: 1_000,
    })).status).toBe(403);

    // THE DOMAIN RULE, which no permission can express. One person holding BOTH roles is a normal
    // arrangement on a small contractor, and the permissions are then satisfied twice over — so the
    // refusal has to come from the record, not the grant.
    const own = await draftAgreement(both);
    expect(own.createdBy).toBe('proc-both');
    const self = await both.post(`/api/v1/procurement/framework-agreements/${own.id}/activate`).send({});
    expect(self.status, JSON.stringify(self.body)).toBe(403);
    expect(self.body.message).toMatch(/may not activate their own/);
    // …and somebody else can, immediately, with nothing about the record changed.
    expect((await post<Agreement>(procmgr, `/api/v1/procurement/framework-agreements/${own.id}/activate`)).activatedBy).toBe('proc-mgr');
  });

  it('lets the Buyer draw down against a ceiling somebody else authorised', async () => {
    const fa = await draftAgreement();
    await post(procmgr, `/api/v1/procurement/framework-agreements/${fa.id}/activate`);

    // Routine buying, bounded by a limit the Buyer cannot raise. It was refused before, because
    // `call-offs` is not `create` or `update`.
    const drawn = await post<{ agreement: Agreement }>(buyer, `/api/v1/procurement/framework-agreements/${fa.id}/call-offs`, {
      title: 'Cable drop 1', value: 250_000,
    });
    expect(drawn.agreement.calledOffValue).toBe(250_000);

    // …and the ceiling still binds.
    const over = await buyer.post(`/api/v1/procurement/framework-agreements/${fa.id}/call-offs`).send({ title: 'too much', value: 900_000 });
    expect(over.status).toBeGreaterThanOrEqual(400);
  });

  it('records who ended the agreement, and stops the drawdown', async () => {
    const fa = await draftAgreement();
    await post(procmgr, `/api/v1/procurement/framework-agreements/${fa.id}/activate`);

    const ended = await post<Agreement>(procmgr, `/api/v1/procurement/framework-agreements/${fa.id}/terminate`);
    expect(ended).toMatchObject({ status: 'terminated', terminatedBy: 'proc-mgr' });

    const after = await buyer.post(`/api/v1/procurement/framework-agreements/${fa.id}/call-offs`).send({ title: 'after', value: 1_000 });
    expect(after.status).toBeGreaterThanOrEqual(400);
  });

  it('still refuses the legacy award route, and says where the award went', async () => {
    // A tombstone, deliberately left working as a refusal (SUP-14). It carries NO declared permission
    // on purpose: the guard runs before the handler, so declaring one would replace this sentence
    // with a bare 403 for the very callers who need to be told where to go.
    const res = await buyer.patch('/api/v1/procurement/rfqs/00000000-0000-0000-0000-000000000000/award').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/awarding a quote directly is no longer possible/);
    expect(res.body.message).toMatch(/recommendations\/:id\/award/);
  });
});
