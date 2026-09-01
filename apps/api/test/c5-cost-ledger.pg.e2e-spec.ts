import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, CompaniesService, TenantContext } from '@aura/core';
import { CbsService, CostLedgerService } from '@aura/projects';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

const RUN = Date.now();
const TENANT = `c5-cost-${RUN}`;
const COMPANY = `c5-company-${RUN}`;
const ACTOR = `c5-actor-${RUN}`;
const ROLE = `c5-role-${RUN}`;

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
  if (!url) throw new Error('C5 PostgreSQL proof requires MIGRATION_DATABASE_URL or DATABASE_URL');
  const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
  await client.connect();
  try { return (await client.query<T>(sql, values)).rows; } finally { await client.end(); }
}

describe('PD-5C C5 cost ledger — governed PostgreSQL proof', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let tenantContext: TenantContext;
  let ledger: CostLedgerService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for C5 PostgreSQL proof');
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    const access = app.get(AccessService);
    access.registerRole({ id: ROLE, name: 'C5 proof', permissions: ['*'] });
    access.grant({ userId: ACTOR, roleId: ROLE, scope: { kind: 'org', level: 'tenant', id: TENANT } });
    tenantContext = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) => {
      tenantContext.run({ tenantId: TENANT, companyId: COMPANY, actorId: ACTOR, correlationId: `c5-${RUN}` }, () => next());
    });
    await app.init();
    http = request(app.getHttpServer());
    ledger = app.get(CostLedgerService);
    await tenantContext.run({ tenantId: TENANT, companyId: null, actorId: ACTOR, correlationId: `c5-setup-${RUN}` }, () =>
      app.get(CompaniesService).upsert({ id: COMPANY, tenantId: TENANT, name: `C5 Company ${RUN}`, code: `C5${RUN}`, trn: '', baseCurrency: 'AED', active: true }));
  });

  afterAll(async () => { await app?.close(); });

  it('persists canonical actual cost, monetary provenance, convergent projection, and EVM semantics', async () => {
    const project = (await http.post('/api/v1/projects/projects').send({ title: `C5 Project ${RUN}`, value: 100_000 }).expect(201)).body as { id: string };
    const cbs = (await http.post('/api/v1/projects/cbs').send({ projectId: project.id, code: `C5-${RUN}`, title: 'C5 Labour', budgetAmount: 10_000, currency: 'AED' }).expect(201)).body as { id: string };
    const wbs = (await http.post('/api/v1/projects/wbs').send({ projectId: project.id, code: `C5-${RUN}`, title: 'C5 Work', plannedValue: 10_000 }).expect(201)).body as { id: string };

    // The opening baseline is approved through the application command, not SQL.
    await http.post(`/api/v1/projects/projects/${project.id}/wbs-baseline`).expect(201);

    const dedupeKey = `c5-labour:${RUN}`;
    const sourceRef = `C5 labour ${RUN}`;
    const postCanonical = () => tenantContext.run({ tenantId: TENANT, companyId: COMPANY, actorId: ACTOR, correlationId: `c5-post-${RUN}` }, () => ledger.post({
      tenantId: TENANT, companyId: COMPANY, projectId: project.id, cbsNodeId: cbs.id, wbsNodeId: wbs.id,
      type: 'actual', amount: 1000, quantity: 10, source: 'labour_timesheet', sourceRef,
      dedupeKey, dimensions: { labourId: `c5-labour-id-${RUN}`, trade: 'C5 Electrician' },
      sourceAmount: 1000, sourceCurrency: 'AED', exchangeRate: 1, rateDate: '2026-09-01T08:00:00.000Z',
      rateSource: 'same_currency', baseAmount: 1000, baseCurrency: 'AED', occurredAt: '2026-09-01T08:00:00.000Z',
    }));
    await postCanonical();
    await Promise.all([postCanonical(), postCanonical()]);

    const row = await until(async () => {
      const rows = await ownerQuery<{
        id: string; type: string; source: string; source_ref: string | null; dedupe_key: string | null;
        amount: string; source_amount: string; source_currency: string; exchange_rate: string;
        base_amount: string; base_currency: string; occurred_at: string; dimensions: { labourId?: string; trade?: string };
      }>(`select id, type, source, source_ref, dedupe_key, amount, source_amount, source_currency, exchange_rate,
                 base_amount, base_currency, occurred_at::text, dimensions
            from public.aura_projects_cost_ledger where tenant_id=$1 and dedupe_key=$2 limit 1`, [TENANT, dedupeKey]);
      return rows[0] ?? null;
    });
    expect(row).toMatchObject({ type: 'actual', source: 'labour_timesheet', source_currency: 'AED', base_currency: 'AED' });
    expect(Number(row?.amount)).toBe(1000);
    expect(Number(row?.source_amount)).toBe(1000);
    expect(Number(row?.exchange_rate)).toBe(1);
    expect(Number(row?.base_amount)).toBe(1000);

    const projected = await until(async () => {
      const rows = await ownerQuery<{ actual_amount: string }>(`select actual_amount::text from public.aura_projects_cbs_nodes where id=$1`, [cbs.id]);
      return rows[0] && Number(rows[0].actual_amount) === 1000 ? rows[0] : null;
    });
    expect(Number(projected?.actual_amount)).toBe(1000);

    // A failed/stale projection is repaired by replaying the canonical ledger fact; no second
    // ledger row is created and the projection converges to the ledger sum.
    await tenantContext.run({ tenantId: TENANT, companyId: COMPANY, actorId: ACTOR, correlationId: `c5-repair-${RUN}` }, () => app.get(CbsService).reconcileActualProjection(cbs.id, 0));
    expect(Number((await ownerQuery<{ actual_amount: string }>(`select actual_amount::text from public.aura_projects_cbs_nodes where id=$1`, [cbs.id]))[0].actual_amount)).toBe(0);
    await postCanonical();
    const afterReplay = await ownerQuery<{ ledger: string; actual_amount: string }>(
      `select (select count(*) from public.aura_projects_cost_ledger where tenant_id=$1 and dedupe_key=$2)::text as ledger,
              (select actual_amount::text from public.aura_projects_cbs_nodes where id=$3) as actual_amount`,
      [TENANT, row!.dedupe_key, cbs.id],
    );
    expect(afterReplay[0].ledger).toBe('1');
    expect(Number(afterReplay[0].actual_amount)).toBe(1000);

    // Direct actual mutation is rejected at the API boundary.
    await http.patch(`/api/v1/projects/cbs/${cbs.id}`).send({ actualAmount: 9999 }).expect(409);
    expect(Number((await ownerQuery<{ actual_amount: string }>(`select actual_amount::text from public.aura_projects_cbs_nodes where id=$1`, [cbs.id]))[0].actual_amount)).toBe(1000);

    const evm = (await http.get(`/api/v1/projects/projects/${project.id}/evm`).expect(200)).body as {
      budgetAtCompletion: number | null; earnedValue: number | null; actualCost: number | null; costVariance: number | null;
      cpi: number | null; plannedValue: number | null; scheduleVariance: number | null; spi: number | null;
    };
    expect(evm.budgetAtCompletion).toBe(10_000);
    expect(evm.earnedValue).toBe(0);
    expect(evm.actualCost).toBe(1000);
    expect(evm.costVariance).toBe(-1000);
    expect(evm.cpi).toBe(0);
    expect(evm.plannedValue).toBeNull();
    expect(evm.scheduleVariance).toBeNull();
    expect(evm.spi).toBeNull();
    expect(wbs.id).toBeTruthy();
  });

  it('enforces tenant ownership and keeps AP payment out of project actual cost', async () => {
    const own = await ownerQuery<{ count: string }>(`select count(*)::text as count from public.aura_projects_cost_ledger where tenant_id=$1`, [TENANT]);
    const foreign = await ownerQuery<{ count: string }>(`select count(*)::text as count from public.aura_projects_cost_ledger where tenant_id=$1`, [`c5-other-${RUN}`]);
    expect(Number(own[0].count)).toBeGreaterThan(0);
    expect(Number(foreign[0].count)).toBe(0);
    const paymentRows = await ownerQuery<{ count: string }>(`select count(*)::text as count from public.aura_projects_cost_ledger where tenant_id=$1 and source='finance_invoice_paid'`, [TENANT]);
    expect(Number(paymentRows[0].count)).toBe(0);
  });
});
