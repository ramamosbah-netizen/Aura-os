// J1-07 — pre-award discovery authority, over HTTP, Auth-ON.
//
// THE QUESTION THIS SPEC EXISTS TO ANSWER: when a solution scope is signed off, whose signature is it?
//
// Executed against the running API before this change, the answer was "whoever happened to hold a
// wildcard". None of these routes declared a permission, so the guard derived one from the path —
// `crm.opportunity.scopes`, `crm.opportunity.approve`, `crm.opportunity.generate-quotation` — and no
// shipped role names any of them. One administrator wrote a scope, approved that same scope, and
// generated the customer quotation from it, while the Technical Manager, who holds `crm.scope.approve`
// precisely for this, was refused on all three.
//
// Three principals, all on unmodified shipped roles:
//   presales   r-pre-sales          writes the scope; must not be able to sign it off
//   techmgr    r-technical-manager  signs it off; must not be able to write one
//   wildcard   r-admin              can reach both, which is why the DOMAIN rule has to exist
//
// WHAT THIS PROVES: the HTTP contract, which principal each act belongs to, the statuses of the
// refusals, and that a self-approval is refused even for a principal authorised to do both halves.
// WHAT IT DOES NOT PROVE: persistence — in-memory stores, by construction. Whether `created_by` and
// `separation_of_duties` actually reach Postgres is the browser suite's job, against the real schema.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `j107-${Date.now()}`;
const LINES = [{ discipline: 'CCTV', description: '4MP dome camera, installed', unit: 'nr', quantity: 24, unitPrice: 950 }];

describe('J1-07 — the author writes the scope, somebody else signs it off (HTTP, Auth-ON)', () => {
  let app: INestApplication;
  let presales: ReturnType<typeof request.agent>;
  let techmgr: ReturnType<typeof request.agent>;
  let wildcard: ReturnType<typeof request.agent>;
  let opportunityId: string;

  const post = async <T>(a: ReturnType<typeof request.agent>, path: string, data?: unknown): Promise<T> => {
    const res = await a.post(path).send(data ?? {});
    expect(res.ok, `${path} — ${res.status} ${JSON.stringify(res.body)}`).toBe(true);
    return res.body as T;
  };
  const scopes = (o: string) => `/api/v1/crm/opportunities/${o}/scopes`;

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'j107-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());

    const auth = app.get(AuthService);
    const access = app.get(AccessService);
    const users = app.get(UsersService);

    // Shipped roles, unmodified. Widening one until a test passes would prove something about the
    // fixture and nothing about the product.
    access.grant({ userId: 'j107-presales', roleId: 'r-pre-sales', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'j107-techmgr', roleId: 'r-technical-manager', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: 'j107-wildcard', roleId: 'r-admin', scope: { kind: 'org', level: 'tenant', id: TENANT } });
    for (const userId of ['j107-presales', 'j107-techmgr', 'j107-wildcard']) {
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
    presales = agent('j107-presales'); techmgr = agent('j107-techmgr'); wildcard = agent('j107-wildcard');

    const opportunity = await post<{ id: string }>(wildcard, '/api/v1/crm/opportunities', {
      title: `ELV package ${Date.now()}`, accountName: 'Al Nahda Tower', value: 22_800,
    });
    opportunityId = opportunity.id;
  });

  afterAll(async () => { await app?.close(); });

  it('lets Pre-Sales write the scope — which the derived permission did not', () => {
    // `crm.scope.create`, a permission r-pre-sales has held all along. The route used to ask for
    // `crm.opportunity.scopes`, which it does not hold, so the role whose entire description is
    // "prepares the technical study and canonical solution scope" got a 403 here.
    return post<{ id: string; status: string; total: number; createdBy: string }>(
      presales, scopes(opportunityId), { title: 'ELV — CCTV package', lines: LINES },
    ).then((scope) => {
      expect(scope.status).toBe('draft');
      expect(scope.total).toBe(22_800);
      expect(scope.createdBy, 'the author is recorded on the scope, not only in the event log').toBe('j107-presales');
    });
  });

  it('refuses the Technical Manager an authorship it does not hold', async () => {
    const res = await techmgr.post(scopes(opportunityId)).send({ title: 'written by the reviewer', lines: LINES });
    expect(res.status).toBe(403);
  });

  it('refuses the author the sign-off, and lets the reviewer give it', async () => {
    const scope = await post<{ id: string }>(presales, scopes(opportunityId), { title: 'ELV — head-end', lines: LINES });

    // THE AUTHOR. Refused at the authority layer: r-pre-sales does not hold `crm.scope.approve`, so
    // this never reaches the domain rule.
    const selfApproval = await presales.post(`${scopes(opportunityId)}/${scope.id}/approve`).send({});
    expect(selfApproval.status).toBe(403);

    // THE REVIEWER. The same act, by the role that exists for it.
    const approved = await post<{ status: string; approvedBy: string; createdBy: string; separationOfDuties: string }>(
      techmgr, `${scopes(opportunityId)}/${scope.id}/approve`,
    );
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe('j107-techmgr');
    expect(approved.createdBy).toBe('j107-presales');
    // The row says the control ran. `approved` alone cannot be told apart from a legacy scope where
    // the check could not run, which is why this is stored rather than inferred.
    expect(approved.separationOfDuties).toBe('enforced');
  });

  it('refuses a self-approval even for a principal authorised to do both halves', async () => {
    // THE EXACT SCENARIO THE FINDING WAS FOUND BY. A wildcard holder can legitimately create and can
    // legitimately approve, so permissions alone can never refuse this — one person holding both
    // roles is a real and permitted arrangement. The domain rule is what makes sign-off a review.
    const own = await post<{ id: string; createdBy: string }>(wildcard, scopes(opportunityId), { title: 'written by the approver', lines: LINES });
    expect(own.createdBy).toBe('j107-wildcard');

    const res = await wildcard.post(`${scopes(opportunityId)}/${own.id}/approve`).send({});
    // 403 and not 400: the request is well formed and the scope is at the right step. A DIFFERENT
    // person can approve it right now with nothing else changing — only the actor is wrong.
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.message).toMatch(/may not approve their own work/);

    // And it is still approvable — the refusal blocked a person, not the scope.
    const approved = await post<{ status: string; separationOfDuties: string }>(techmgr, `${scopes(opportunityId)}/${own.id}/approve`);
    expect(approved.status).toBe('approved');
    expect(approved.separationOfDuties).toBe('enforced');
  });

  it('keeps the customer-facing offer out of both their hands', async () => {
    const scope = await post<{ id: string }>(presales, scopes(opportunityId), { title: 'ELV — quotable', lines: LINES });
    await post(techmgr, `${scopes(opportunityId)}/${scope.id}/approve`);

    // Turning a signed-off scope into a quotation is a THIRD act, governed as quotation authorship.
    // Neither the author nor the approver holds `crm.quotation.create`.
    for (const [who, agent] of [['pre-sales', presales], ['technical manager', techmgr]] as const) {
      const res = await agent.post(`${scopes(opportunityId)}/${scope.id}/generate-quotation`).send({ customerName: 'Al Nahda Tower' });
      expect(res.status, `${who} should not be able to raise the customer offer`).toBe(403);
    }

    const quotation = await post<{ id: string; subtotal: number; total: number; lines: Array<{ quantity: number; unitPrice: number }> }>(
      wildcard, `${scopes(opportunityId)}/${scope.id}/generate-quotation`, { customerName: 'Al Nahda Tower' },
    );
    // The SCOPE's value carries over as the quotation's net; the quotation then applies its own tax
    // authority on top. Asserting the scope figure against `total` would be asserting that a customer
    // offer must equal an internal scope, which is a different claim and a false one.
    expect(quotation.subtotal).toBe(22_800);
    expect(quotation.total).toBeGreaterThanOrEqual(quotation.subtotal);
    expect(quotation.lines).toHaveLength(1);
    expect(quotation.lines[0]).toMatchObject({ quantity: 24, unitPrice: 950 });
  });

  it('lets the capture routes be reached by a role that names the permission', async () => {
    // `crm.requirement.*`. The derived name was `crm.opportunity.requirements`, which r-sales does
    // not hold either — so before this, recording what the customer asked for was a wildcard-only
    // act. Pre-Sales reads them (Scope Assist grounds proposed lines on them) and does not capture.
    const requirement = await post<{ id: string; createdBy: string }>(
      wildcard, `/api/v1/crm/opportunities/${opportunityId}/requirements`,
      { title: '24 cameras, IP, 4MP minimum', priority: 'must' },
    );
    expect(requirement.createdBy).toBe('j107-wildcard');

    const readable = await presales.get(`/api/v1/crm/opportunities/${opportunityId}/requirements`);
    expect(readable.status).toBe(200);
    expect(readable.body.map((r: { id: string }) => r.id)).toContain(requirement.id);

    const captured = await presales.post(`/api/v1/crm/opportunities/${opportunityId}/requirements`).send({ title: 'written by pre-sales' });
    expect(captured.status).toBe(403);
  });
});
