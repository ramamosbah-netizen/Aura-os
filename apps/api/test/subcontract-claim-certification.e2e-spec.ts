// Subcontractor payment certification — over HTTP, Auth-ON.
//
// THE QUESTION THIS SPEC EXISTS TO ANSWER: when a subcontractor gets paid, how many people said yes?
//
// Before this change the answer was one. Executed against the running API, a single administrator
// raised a claim, certified it, and paid it, with no refusal at any step — because no shipped role
// held a single `subcontracts.*` permission, so all twenty routes were reachable through r-admin's
// global wildcard and nobody else's. The Commercial Manager / QS role, whose description says it
// "governs estimates, quotations, contracts, variations, CLAIMS and payment applications", could not
// raise, certify or pay one.
//
// Underneath: `certifyClaim` asserted `finance.invoice.approve` (a finance permission, for a
// quantity-surveying judgement about work on site); certifying twice silently re-stamped the
// certificate; payment recorded nobody; and a claim of 250,000 against a 100,000 subcontract
// certified for 225,000 net.
//
// Four principals, all on unmodified shipped roles:
//   pm         r-pm                  raises the application; certifies nothing
//   qs         r-commercial-manager  certifies
//   qs2        r-commercial-manager  the second QS — same role, different person
//   finance    r-finance             releases the money; certifies nothing
//
// WHAT THIS PROVES: the HTTP contract, which principal each act belongs to, and the status of every
// refusal. WHAT IT DOES NOT PROVE: persistence — in-memory stores, by construction. That is
// modules/subcontracts/src/claim-certification.pg-int.test.ts, against the real schema.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, AuthService, TenantContext, UsersService } from '@aura/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';

const TENANT = `sub-e2e-${Date.now()}`;

interface ClaimBody {
  id: string; claimNumber: number; status: string; netCertifiedValue: number;
  createdBy: string | null; certifiedBy: string | null; certifiedAt: string | null;
  paidBy: string | null; paidAt: string | null;
}

describe('subcontractor certification — three acts, three signatures (HTTP, Auth-ON)', () => {
  let app: INestApplication;
  let pm: ReturnType<typeof request.agent>;
  let qs: ReturnType<typeof request.agent>;
  let qs2: ReturnType<typeof request.agent>;
  let finance: ReturnType<typeof request.agent>;
  /** Scaffolding only. Creating a delivery PROJECT is not a subcontracts act and belongs to nobody
   * in this spec's cast — using an admin for it keeps the four real principals unmodified. */
  let seeder: ReturnType<typeof request.agent>;
  let projectId: string;

  const post = async <T>(a: ReturnType<typeof request.agent>, path: string, data?: unknown): Promise<T> => {
    const res = await a.post(path).send(data ?? {});
    expect(res.ok, `${path} — ${res.status} ${JSON.stringify(res.body)}`).toBe(true);
    return res.body as T;
  };
  const patch = async <T>(a: ReturnType<typeof request.agent>, path: string, data?: unknown): Promise<T> => {
    const res = await a.patch(path).send(data ?? {});
    expect(res.ok, `${path} — ${res.status} ${JSON.stringify(res.body)}`).toBe(true);
    return res.body as T;
  };
  /** A fresh, active subcontract of the given value. */
  const newSubcontract = async (value: number): Promise<string> => {
    const s = await post<{ id: string }>(qs, '/api/v1/subcontracts', {
      projectId, subcontractorName: 'Gulf Electromech LLC',
      title: `Containment ${Date.now()}`, value, retentionPercentage: 10,
    });
    await patch(qs, `/api/v1/subcontracts/${s.id}/status`, { status: 'active' });
    return s.id;
  };
  const raise = (a: ReturnType<typeof request.agent>, sid: string, work: number) =>
    a.post('/api/v1/subcontracts/claims').send({ subcontractId: sid, workCompletedValue: work, previouslyCertifiedValue: 0 });

  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = 'subcontract-cert-e2e-only';
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    app.useGlobalFilters(new AllExceptionsFilter());

    const auth = app.get(AuthService);
    const access = app.get(AccessService);
    const users = app.get(UsersService);
    const grants: Array<[string, string]> = [
      ['sub-pm', 'r-pm'], ['sub-qs', 'r-commercial-manager'],
      ['sub-qs2', 'r-commercial-manager'], ['sub-finance', 'r-finance'],
      ['sub-seed', 'r-admin'],
    ];
    for (const [userId, roleId] of grants) {
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
    pm = agent('sub-pm'); qs = agent('sub-qs'); qs2 = agent('sub-qs2'); finance = agent('sub-finance');
    seeder = agent('sub-seed');

    const project = await post<{ id: string }>(seeder, '/api/v1/projects/projects', { title: `SUB ${Date.now()}` });
    projectId = project.id;
  });

  afterAll(async () => { await app?.close(); });

  it('THE CHAIN: the PM applies, the QS certifies, Finance pays — three people', async () => {
    const sid = await newSubcontract(500_000);

    // FINANCE CANNOT RAISE ONE. It reached every route through r-admin before; now it holds exactly
    // one act in this module.
    expect((await raise(finance, sid, 100_000)).status).toBe(403);

    const claim = await post<ClaimBody>(pm, '/api/v1/subcontracts/claims', {
      subcontractId: sid, workCompletedValue: 100_000, previouslyCertifiedValue: 0,
    });
    expect(claim).toMatchObject({ status: 'draft', netCertifiedValue: 90_000, createdBy: 'sub-pm' });

    // THE PM CANNOT CERTIFY THEIR OWN APPLICATION — refused at the authority layer: r-pm does not
    // hold `subcontracts.claim.certify`, so this never reaches the domain rule.
    expect((await pm.patch(`/api/v1/subcontracts/claims/${claim.id}/certify`).send({})).status).toBe(403);
    // …and neither can Finance, whose `finance.invoice.approve` the service used to ask for.
    expect((await finance.patch(`/api/v1/subcontracts/claims/${claim.id}/certify`).send({})).status).toBe(403);

    const certified = await patch<ClaimBody>(qs, `/api/v1/subcontracts/claims/${claim.id}/certify`);
    expect(certified).toMatchObject({ status: 'certified', certifiedBy: 'sub-qs', createdBy: 'sub-pm' });
    expect(certified.certifiedAt).not.toBeNull();

    // A SECOND CERTIFICATION IS REFUSED — it used to return 200 and re-stamp the certificate.
    const twice = await qs2.patch(`/api/v1/subcontracts/claims/${claim.id}/certify`).send({});
    expect(twice.status).toBe(409);
    expect(twice.body.message).toMatch(/already certified/);

    // THE CERTIFIER CANNOT RELEASE THEIR OWN CERTIFICATE — and neither can the other QS, who holds
    // no payment permission at all.
    expect((await qs.patch(`/api/v1/subcontracts/claims/${claim.id}/pay`).send({})).status).toBe(403);
    expect((await qs2.patch(`/api/v1/subcontracts/claims/${claim.id}/pay`).send({})).status).toBe(403);

    const paid = await patch<ClaimBody>(finance, `/api/v1/subcontracts/claims/${claim.id}/pay`);
    expect(paid).toMatchObject({ status: 'paid', paidBy: 'sub-finance', certifiedBy: 'sub-qs', createdBy: 'sub-pm' });
    expect(paid.paidAt, 'who released the money was recorded only on the event spine before').not.toBeNull();
  });

  it('refuses the QS who raised a claim the certification of it', async () => {
    // The role split is not the only control: Commercial / QS may legitimately raise AND certify, so
    // one person holding both is a real arrangement and no permission can refuse it. The domain reads
    // the record.
    const sid = await newSubcontract(500_000);
    const own = await post<ClaimBody>(qs, '/api/v1/subcontracts/claims', {
      subcontractId: sid, workCompletedValue: 100_000, previouslyCertifiedValue: 0,
    });
    expect(own.createdBy).toBe('sub-qs');

    const self = await qs.patch(`/api/v1/subcontracts/claims/${own.id}/certify`).send({});
    expect(self.status, JSON.stringify(self.body)).toBe(403);
    expect(self.body.message).toMatch(/may not certify their own application/);

    // Still certifiable — the refusal blocked a person, not the claim.
    const certified = await patch<ClaimBody>(qs2, `/api/v1/subcontracts/claims/${own.id}/certify`);
    expect(certified).toMatchObject({ status: 'certified', certifiedBy: 'sub-qs2' });
  });

  it('will not certify past what the subcontract is worth, and a variation is what raises it', async () => {
    // 250,000 against a 100,000 subcontract certified for 225,000 net before this existed.
    const sid = await newSubcontract(100_000);
    const over = await post<ClaimBody>(pm, '/api/v1/subcontracts/claims', {
      subcontractId: sid, workCompletedValue: 250_000, previouslyCertifiedValue: 0,
    });

    const refused = await qs.patch(`/api/v1/subcontracts/claims/${over.id}/certify`).send({});
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(refused.body.message).toMatch(/would take this subcontract past its authorised value of 100000/);

    // THE GOVERNED WAY TO RAISE THE CEILING. The PM instructs it and cannot approve it.
    const variation = await post<{ id: string }>(pm, '/api/v1/subcontracts/variations', {
      subcontractId: sid, reference: `VO-${Date.now()}`, type: 'addition', amount: 200_000, description: 'extra containment',
    });
    expect((await pm.patch(`/api/v1/subcontracts/variations/${variation.id}/approve`).send({})).status).toBe(403);
    await patch(qs, `/api/v1/subcontracts/variations/${variation.id}/approve`);

    // …and now the same claim certifies, against a subcontract that is genuinely worth it.
    const certified = await patch<ClaimBody>(qs, `/api/v1/subcontracts/claims/${over.id}/certify`);
    expect(certified.status).toBe('certified');
  });
});
