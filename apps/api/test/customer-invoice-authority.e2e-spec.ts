// Customer invoicing — over HTTP, Auth-ON.
//
// THE QUESTION THIS SPEC EXISTS TO ANSWER: who sent this invoice to the customer, and who took it back?
//
// Before this change the system could not say. `created_by` was on the row and the `created` event
// named the actor; `issued`, `receipt_recorded` and `cancelled` all carried `actor_id = NULL`, because
// the actor never reached the service — `issue(id)`, `cancel(id)`, `recordReceipt(id, amount)` and
// `softDelete(tenantId, id)` took no actor, so the controller had nobody to pass. Sending a claim to
// a customer, taking money against it and voiding a receivable were anonymous.
//
// A soft-delete of an ISSUED invoice was also accepted — 200 — so a document the customer had already
// received vanished from every list with `deleted_at` set and nobody named.
//
// And the wildcard here was one this programme created: enumerating `finance.*` entity by entity
// removed one wildcard and left sixteen, of which `finance.customer-invoice.*` re-granted issue,
// cancel, delete and post to the same role that raises the invoice.
//
// Two principals, both on unmodified shipped roles:
//   ar          r-finance             raises, sends and takes receipts
//   controller  r-finance-controller  voids, deletes and restores — and cannot raise or send
//
// WHAT THIS PROVES: the HTTP contract, which principal each act belongs to, and the status of every
// refusal. WHAT IT DOES NOT PROVE: persistence — in-memory stores, by construction. That is
// modules/finance/src/customer-invoice-provenance.pg-int.test.ts, against the real schema.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `ci-e2e-${Date.now()}`;

interface InvoiceBody {
  id: string; invoiceNumber: string; status: string; total: number; amountPaid: number;
  createdBy: string | null; issuedBy: string | null; issuedAt: string | null;
  cancelledBy: string | null; cancelReason: string | null;
}

describe('customer invoicing — sending a claim and withdrawing one are two hands (HTTP, Auth-ON)', () => {
  let app: INestApplication;
  let ar: ReturnType<typeof request.agent>;
  let controller: ReturnType<typeof request.agent>;
  let n = 0;

  const post = async <T>(a: ReturnType<typeof request.agent>, path: string, data?: unknown): Promise<T> => {
    const res = await a.post(path).send(data ?? {});
    expect(res.ok, `${path} — ${res.status} ${JSON.stringify(res.body)}`).toBe(true);
    return res.body as T;
  };
  const draft = () => post<InvoiceBody>(ar, '/api/v1/finance/customer-invoices', {
    invoiceNumber: `INV-${TENANT}-${++n}`, customerName: 'Al Nahda Developments', issueDate: '2026-09-18',
    lines: [{ description: 'ELV works, September', quantity: 1, unitPrice: 100_000, vatRate: 5 }],
  });
  const issued = async (): Promise<InvoiceBody> => {
    const d = await draft();
    return await post<InvoiceBody>(ar, `/api/v1/finance/customer-invoices/${d.id}/issue`);
  };

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'customer-invoice-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());

    const auth = app.get(AuthService);
    const access = app.get(AccessService);
    const users = app.get(UsersService);
    for (const [userId, roleId] of [['ci-ar', 'r-finance'], ['ci-controller', 'r-finance-controller']] as const) {
      access.grant({ userId, roleId, scope: { kind: 'org', level: 'tenant', id: TENANT } });
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
    ar = agent('ci-ar'); controller = agent('ci-controller');
  });

  afterAll(async () => { await app?.close(); });

  it('names who sent the invoice — the act was anonymous', async () => {
    const d = await draft();
    expect(d).toMatchObject({ status: 'draft', total: 105_000, createdBy: 'ci-ar', issuedBy: null });

    const sent = await post<InvoiceBody>(ar, `/api/v1/finance/customer-invoices/${d.id}/issue`);
    expect(sent).toMatchObject({ status: 'issued', issuedBy: 'ci-ar' });
    expect(sent.issuedAt, 'the issued event carried actor_id NULL and the row held nothing').not.toBeNull();

    // The controller may void invoices, not send them.
    const other = await draft();
    expect((await controller.post(`/api/v1/finance/customer-invoices/${other.id}/issue`).send({})).status).toBe(403);
  });

  it('refuses AR the void, and refuses the issuer even when they hold the authority', async () => {
    const sent = await issued();

    // AUTHORITY LAYER. Voiding a receivable the customer has seen is the controller's.
    const arVoid = await ar.post(`/api/v1/finance/customer-invoices/${sent.id}/cancel`).send({ reason: 'raised in error' });
    expect(arVoid.status).toBe(403);

    // A REASON IS REQUIRED — 400, because the caller can fix it by supplying one.
    expect((await controller.post(`/api/v1/finance/customer-invoices/${sent.id}/cancel`).send({})).status).toBe(400);
    expect((await controller.post(`/api/v1/finance/customer-invoices/${sent.id}/cancel`).send({ reason: '  ' })).status).toBe(400);

    const voided = await post<InvoiceBody>(controller, `/api/v1/finance/customer-invoices/${sent.id}/cancel`, {
      reason: 'raised against the wrong contract',
    });
    expect(voided).toMatchObject({
      status: 'cancelled', issuedBy: 'ci-ar',
      cancelledBy: 'ci-controller', cancelReason: 'raised against the wrong contract',
    });
  });

  it('will not make a document the customer has seen disappear', async () => {
    // 200 before this: `deleted_at` set on an ISSUED invoice, nobody named, gone from every list.
    const sent = await issued();
    const deleted = await controller.delete(`/api/v1/finance/customer-invoices/${sent.id}`).send({});
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(409);
    expect(deleted.body.message).toMatch(/only a draft or cancelled customer invoice may be deleted/);

    // The bulk route loops the same act, so it inherits the refusal rather than routing around it.
    const bulk = await controller.post('/api/v1/finance/customer-invoices/bulk').send({ action: 'delete', ids: [sent.id] });
    expect(bulk.status).toBe(409);

    // A DRAFT raised by mistake may still go — and AR cannot do it.
    const d = await draft();
    expect((await ar.delete(`/api/v1/finance/customer-invoices/${d.id}`).send({})).status).toBe(403);
    expect((await controller.delete(`/api/v1/finance/customer-invoices/${d.id}`).send({})).status).toBe(200);
  });

  it('keeps the receipts with AR, and still refuses a receipt on a draft', async () => {
    const sent = await issued();
    expect((await controller.post(`/api/v1/finance/customer-invoices/${sent.id}/receipts`).send({ amount: 10_000 })).status).toBe(403);

    const paid = await post<InvoiceBody>(ar, `/api/v1/finance/customer-invoices/${sent.id}/receipts`, { amount: 10_000 });
    expect(paid).toMatchObject({ status: 'partially_paid', amountPaid: 10_000 });

    // …and the existing rule still holds: money against an invoice nobody sent is refused.
    const d = await draft();
    expect((await ar.post(`/api/v1/finance/customer-invoices/${d.id}/receipts`).send({ amount: 1_000 })).status).toBeGreaterThanOrEqual(400);

    // Once money is on it, the void is refused for the reason it always was.
    const held = await controller.post(`/api/v1/finance/customer-invoices/${sent.id}/cancel`).send({ reason: 'change of mind' });
    expect(held.status).toBeGreaterThanOrEqual(400);
    expect(held.body.message).toMatch(/receipts recorded/);
  });
});
