// C4 certification persistence proof.  All business writes use the existing public commands;
// direct SQL below is read-only evidence against the disposable PostgreSQL database.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, TenantContext, UsersService } from '@aura/core';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { establishGovernedQuotationReadiness } from './helpers/governed-quotation-readiness';

const TENANT = `c4-cert-${Date.now()}`;
const TITLE = `C4 governed certification ${Date.now()}`;
const ROLE = `c4-role-${Date.now()}`;
const MAKER = `c4-maker-${Date.now()}`;
const CERTIFIER = `c4-certifier-${Date.now()}`;

async function until<T>(read: () => Promise<T | null>, tries = 40): Promise<T | null> {
  for (let i = 0; i < tries; i += 1) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return read();
}

async function ownerQuery<T extends pg.QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('C4 PostgreSQL proof requires MIGRATION_DATABASE_URL or DATABASE_URL');
  const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  await client.connect();
  try { return (await client.query<T>(sql, values)).rows; } finally { await client.end(); }
}

describe('PD-5C C4 certification — governed PostgreSQL proof', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for C4 PostgreSQL proof');
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false, transformOptions: { exposeUnsetFields: false } }));
    const access = app.get(AccessService);
    access.registerRole({ id: ROLE, name: 'C4 proof', permissions: ['*'] });
    access.grant({ userId: MAKER, roleId: ROLE, scope: { kind: 'org', level: 'tenant', id: TENANT } });
    access.grant({ userId: CERTIFIER, roleId: ROLE, scope: { kind: 'org', level: 'tenant', id: TENANT }, approvalLimit: 1_000_000 });
    app.get(UsersService).save({ tenantId: TENANT, userId: MAKER, displayName: 'C4 maker', active: true });
    app.get(UsersService).save({ tenantId: TENANT, userId: CERTIFIER, displayName: 'C4 certifier', active: true });
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) => {
      const header = (_req as { headers?: Record<string, string> }).headers?.['x-e2e-actor'];
      const actorId = header === 'none' ? null : (header ?? MAKER);
      tenant.run({ tenantId: TENANT, companyId: null, actorId, correlationId: `c4-${Date.now()}` }, () => next());
    });
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => { await app?.close(); });

  it('executes governed handover → map → install → certify and persists one certified fact', async () => {
    const accountResponse = await http.post('/api/v1/crm/accounts').send({ name: `${TITLE} Account` });
    if (accountResponse.status !== 201) throw new Error(`account setup failed: ${accountResponse.status} ${JSON.stringify(accountResponse.body)}`);
    const account = accountResponse.body;
    const opportunity = (await http.post('/api/v1/crm/opportunities').send({ title: TITLE, value: 600000, accountId: account.id, accountName: account.name, executionType: 'tender' }).expect(201)).body;
    const tender = (await http.post('/api/v1/tendering/tenders').send({ title: `${TITLE} Tender`, value: 600000, accountId: account.id, accountName: account.name, status: 'submitted', sourceOpportunityId: opportunity.id }).expect(201)).body;
    await http.post('/api/v1/tendering/bid-scores').send({ tenderId: tender.id, criteria: [{ name: 'Strategic fit', weight: 1, score: 8 }], notes: 'C4 governed fixture' }).expect(201);
    const study = (await http.post(`/api/v1/tendering/tenders/${tender.id}/studies`).send({
      title: `${TITLE} technical study`, inputRevision: 'Client specification Rev 01', reviewerId: CERTIFIER,
      scopeSummary: TITLE,
      systems: [{ discipline: 'ELV', name: 'CCTV', designBasis: 'Approved C4 basis', interfaces: [] }],
      requirements: [{ category: 'client', statement: '100 nr required', acceptanceCriteria: 'Install and certify', compliance: 'compliant', response: 'Included' }],
      surveyFindings: [], clarifications: [], deviations: [], assumptions: [], exclusions: [], evidence: [],
    }).expect(201)).body;
    await http.post(`/api/v1/tendering/tenders/${tender.id}/studies/${study.id}/submit`).send({}).expect(201);
    await http.post(`/api/v1/tendering/tenders/${tender.id}/studies/${study.id}/approve`).set('x-e2e-actor', CERTIFIER).send({ comment: 'Approved for estimation' }).expect(201);
    await http.patch(`/api/v1/tendering/tenders/${tender.id}/status`).send({ status: 'estimating' }).expect(200);
    const takeoff = (await http.post(`/api/v1/tendering/tenders/${tender.id}/quantity-takeoff`).send({ lines: [{ description: TITLE, unit: 'nr', quantity: 100 }] }).expect(201)).body;
    await http.post(`/api/v1/tendering/tenders/${tender.id}/quantity-takeoff/${takeoff.id}/approve`).set('x-e2e-actor', CERTIFIER).send({}).expect(201);
    const projection = (await http.post(`/api/v1/tendering/tenders/${tender.id}/quantity-takeoff/${takeoff.id}/project-to-boq`).send({}).expect(201)).body;
    const item = projection.items[0];
    await http.post('/api/v1/tendering/estimates').send({ boqItemId: item.id, components: [{ costType: 'material', description: TITLE, quantity: 1, unitCost: 100 }], applyToBoq: false }).expect(201);
    await http.patch(`/api/v1/tendering/tenders/${tender.id}/status`).send({ status: 'priced' }).expect(200);
    const quotation = (await http.post(`/api/v1/tendering/tenders/${tender.id}/quotation`).send({}).expect(201)).body;
    await establishGovernedQuotationReadiness(http, quotation.id, `c4-${tender.id}`);
    await http.patch(`/api/v1/crm/quotations/${quotation.id}/status`).send({ action: 'submit_review' }).expect(200);
    await http.patch(`/api/v1/crm/quotations/${quotation.id}/status`).set('x-e2e-actor', CERTIFIER).send({ action: 'approve' }).expect(200);
    const award = await http.post(`/api/v1/tendering/tenders/${tender.id}/award`).set('x-e2e-actor', CERTIFIER).send({ awardedValue: 600000, currency: 'AED', awardedAt: '2026-09-01T08:00:00.000Z', awardReference: `C4-${tender.id}` });
    if (award.status !== 201) throw new Error(`governed award failed: ${award.status} ${JSON.stringify(award.body)}`);

    const contract = await until(async () => ((await http.get(`/api/v1/contracts/contracts?tenderId=${tender.id}`).expect(200)).body as any[])[0] ?? null);
    expect(contract).toBeTruthy();
    await http.patch(`/api/v1/contracts/contracts/${contract!.id}/status`).send({ status: 'active' }).expect(200);
    const project = await until(async () => ((await http.get(`/api/v1/projects/projects?contractId=${contract!.id}`).expect(200)).body as any[])[0] ?? null);
    expect(project).toBeTruthy();
    const frozen = project!.handoverSnapshot.sourceItems[0];
    expect(frozen).toMatchObject({ sourceItemId: item.id, frozenItemKey: expect.any(String), unit: 'nr', soldQuantity: 100 });

    const wbs = (await http.post('/api/v1/projects/wbs').send({ projectId: project!.id, code: 'C4.1', title: TITLE, plannedValue: 100000, boqItemId: item.id }).expect(201)).body;
    await http.post('/api/v1/projects/delivery-item-maps').send({ projectId: project!.id, frozenItemKey: frozen.frozenItemKey, wbsNodeId: wbs.id }).expect(201);
    await http.post('/api/v1/site/installations').send({ projectId: project!.id, boqItemId: item.id, date: '2026-09-01', description: TITLE, quantity: 40, unit: 'nr' }).expect(201);

    const certificate = (await http.post('/api/v1/contracts/certificates').set('x-e2e-actor', MAKER).send({ contractId: contract!.id, cumulativeWorkDone: 4000, reference: `C4-${tender.id}` }).expect(201)).body;
    const line = (await http.post(`/api/v1/contracts/certificates/${certificate.id}/lines`).set('x-e2e-actor', MAKER).send({ projectId: project!.id, boqItemId: item.id, description: TITLE, quantity: 30, unit: 'nr', rate: 100 }).expect(201)).body;
    expect(line.id).toBeTruthy();
    await http.patch(`/api/v1/contracts/certificates/${certificate.id}/status`).set('x-e2e-actor', CERTIFIER).send({ status: 'certified' }).expect(200);

    const certified = await until(async () => {
      const rows = await ownerQuery<{ quantity: string; semantic: string; source: string; source_ref: string; dedupe_key: string }>(
        `select quantity, dimensions->>'semantic' as semantic, source, source_ref, dedupe_key from public.aura_projects_quantity_ledger where tenant_id=$1 and source_ref=$2`,
        [TENANT, `ipc:${certificate.id}:line:${line.id}`],
      );
      return rows[0] ?? null;
    });
    expect(certified).toMatchObject({ quantity: '30', semantic: 'certified', source: 'ipc', source_ref: `ipc:${certificate.id}:line:${line.id}`, dedupe_key: `certified:${certificate.id}:${line.id}` });

    const audit = await ownerQuery<{ count: string }>(`select count(*)::text as count from public.aura_audit_log where tenant_id=$1 and entity_id=$2 and action='certified'`, [TENANT, certificate.id]);
    const events = await ownerQuery<{ count: string }>(`select count(*)::text as count from public.aura_events where tenant_id=$1 and aggregate_id=$2 and type='contracts.ipc.certified'`, [TENANT, certificate.id]);
    expect(Number(audit[0]?.count ?? 0)).toBe(1);
    expect(Number(events[0]?.count ?? 0)).toBe(1);

    // Replaying the already-certified command is an immutable no-op; concurrent replays must also
    // leave exactly one canonical ledger/evidence row.
    await Promise.all([
      http.patch(`/api/v1/contracts/certificates/${certificate.id}/status`).set('x-e2e-actor', CERTIFIER).send({ status: 'certified' }).expect(200),
      http.patch(`/api/v1/contracts/certificates/${certificate.id}/status`).set('x-e2e-actor', CERTIFIER).send({ status: 'certified' }).expect(200),
    ]);
    const afterReplay = await ownerQuery<{ ledger: string; audit: string; events: string }>(
      `select (select count(*) from public.aura_projects_quantity_ledger where tenant_id=$1 and dedupe_key=$2)::text as ledger,
              (select count(*) from public.aura_audit_log where tenant_id=$1 and entity_id=$3 and action='certified')::text as audit,
              (select count(*) from public.aura_events where tenant_id=$1 and aggregate_id=$3 and type='contracts.ipc.certified')::text as events`,
      [TENANT, `certified:${certificate.id}:${line.id}`, certificate.id],
    );
    expect(afterReplay[0]).toMatchObject({ ledger: '1', audit: '1', events: '1' });

    const position = (await http.get(`/api/v1/projects/quantity-ledger/position/${item.id}`).expect(200)).body;
    expect(position).toMatchObject({ sold: 100, installed: 40, certified: 30 });
    expect(project!.handoverSnapshot.sourceItems[0].soldQuantity).toBe(100);
  });
});
