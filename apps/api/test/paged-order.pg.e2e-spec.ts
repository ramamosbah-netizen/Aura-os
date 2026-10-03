// AURA OS — PAGE-ORDER-01: a register paged through its own endpoint shows every row exactly once,
// however many rows tie on its sort column. PostgreSQL, because ties and their order between page
// queries are a property of the database, not of the code.
//
// Ordered by a non-unique column alone, rows that tie come back in no fixed order between page
// queries: measured, 5,200 rows written by one statement paged back as 5,200 rows but 5,199 distinct.
// Each register here is seeded with 5,200 rows that ALL tie on its sort column — written by one
// INSERT, so they share created_at (or, for bank transactions, one transaction date) — and is paged
// through its real HTTP `paged` endpoint 500 at a time, so every page boundary falls inside a tie:
//   leads              a direct store (created_at DESC)
//   bank transactions  a date column that ties in real data too (transaction_date DESC)
//   employees          the HR paging helper (created_at DESC)
//   transmittals       the doc-control paging helper (created_at DESC)
// The ids read must be exactly the ids SQL holds — none repeated, none missing.
//
// The size is the proof's, not decoration: at 2,000 tied rows the old order happened to page back
// intact; at 5,200, with the leads store put back on `ORDER BY created_at DESC` alone, this spec read
// 5,196 distinct leads through the API — four shown twice, four never shown.
//
// Authority is not under test: the harness binds its actor through a context shim.
import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessService, TenantContext } from '@aura/core';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../src/common/all-exceptions.filter';
import { AppModule } from '../src/app.module';

const RUN = Date.now();
const TENANT = `page-order-${RUN}`;
const ACTOR = `page-order-actor-${RUN}`;
const ROLE = `page-order-role-${RUN}`;
const ROWS = 5_200;
const PAGE = 500;
const BANK_ACCOUNT = '5a7c0d34-6b1e-4f6e-9d3a-000000000601';
const PROJECT = '5a7c0d34-6b1e-4f6e-9d3a-000000000602';

async function ownerQuery<T extends pg.QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('PAGE-ORDER-01 PostgreSQL proof requires MIGRATION_DATABASE_URL or DATABASE_URL');
  const client = new pg.Client({ connectionString: url, ssl: false });
  await client.connect();
  try { return (await client.query<T>(sql, values)).rows; } finally { await client.end(); }
}

const TABLES = ['aura_crm_leads', 'aura_finance_bank_transactions', 'aura_hr_employees', 'aura_doccontrol_transmittals'];

describe('PAGE-ORDER-01 — a paged register shows every row exactly once through its ties (PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the PAGE-ORDER-01 PostgreSQL proof');
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    const access = app.get(AccessService);
    access.registerRole({ id: ROLE, name: 'PAGE-ORDER-01 proof', permissions: ['*'] });
    access.grant({ userId: ACTOR, roleId: ROLE, scope: { kind: 'org', level: 'tenant', id: TENANT } });
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) => tenant.run({
      tenantId: TENANT, companyId: `page-order-company-${RUN}`, actorId: ACTOR, correlationId: `page-order-${RUN}`,
    }, () => next()));
    await app.init();
    http = request(app.getHttpServer());

    // One statement per register: every row it writes shares one now().
    await ownerQuery(
      `insert into public.aura_crm_leads (tenant_id, name) select $1, 'Tied lead ' || g from generate_series(1, $2) g`, [TENANT, ROWS]);
    await ownerQuery(
      `insert into public.aura_finance_bank_transactions (id, tenant_id, bank_account_id, transaction_date, amount, description)
       select gen_random_uuid(), $1, $3::uuid, '2026-09-30T00:00:00Z', g, 'Tied transaction ' || g from generate_series(1, $2) g`, [TENANT, ROWS, BANK_ACCOUNT]);
    await ownerQuery(
      `insert into public.aura_hr_employees (id, tenant_id, first_name, last_name, role, department, joined_date)
       select gen_random_uuid(), $1, 'Tied', 'Employee ' || g, 'Technician', 'Operations', '2026-01-01' from generate_series(1, $2) g`, [TENANT, ROWS]);
    await ownerQuery(
      `insert into public.aura_doccontrol_transmittals (id, tenant_id, code, title, project_id)
       select gen_random_uuid(), $1, 'TR-' || g, 'Tied transmittal ' || g, $3::uuid from generate_series(1, $2) g`, [TENANT, ROWS, PROJECT]);
  }, 180_000);

  afterAll(async () => {
    for (const table of TABLES) {
      await ownerQuery(`delete from public.${table} where tenant_id = $1`, [TENANT]).catch(() => undefined);
    }
    await app?.close();
  });

  /** Page through an endpoint to its own total, the way a register screen does. */
  async function readEveryPage(path: string, query: Record<string, string> = {}): Promise<{ ids: string[]; total: number; pages: number }> {
    const ids: string[] = [];
    let total = 0;
    let pages = 0;
    for (let offset = 0; ; offset += PAGE) {
      const res = await http.get(path).query({ ...query, limit: String(PAGE), offset: String(offset) });
      expect(res.status, `${path} offset ${offset}: ${JSON.stringify(res.body).slice(0, 200)}`).toBe(200);
      const page = res.body as { items: Array<{ id: string }>; total: number };
      total = page.total;
      pages += 1;
      ids.push(...page.items.map((i) => i.id));
      if (page.items.length < PAGE || offset + PAGE >= page.total) break;
    }
    return { ids, total, pages };
  }

  const held = async (table: string): Promise<string[]> =>
    (await ownerQuery<{ id: string }>(`select id::text from public.${table} where tenant_id = $1 order by id`, [TENANT])).map((r) => r.id);

  it.each([
    ['leads', '/api/v1/crm/leads/paged', {}, 'aura_crm_leads'],
    ['bank transactions', '/api/v1/finance/bank-transactions/paged', { bankAccountId: BANK_ACCOUNT }, 'aura_finance_bank_transactions'],
    ['employees', '/api/v1/hr/employees/paged', {}, 'aura_hr_employees'],
    ['transmittals', '/api/v1/doccontrol/transmittals/paged', { projectId: PROJECT }, 'aura_doccontrol_transmittals'],
  ] as const)('%s: every one of the tied rows is paged back exactly once', async (_name, path, query, table) => {
    const tied = await ownerQuery<{ n: string; keys: string }>(
      `select count(*)::text as n, count(distinct ${table === 'aura_finance_bank_transactions' ? 'transaction_date' : 'created_at'})::text as keys
         from public.${table} where tenant_id = $1`, [TENANT]);
    expect(tied[0], 'the seed is one tie: every row shares the sort key').toEqual({ n: String(ROWS), keys: '1' });

    const read = await readEveryPage(path, query);
    expect(read.total).toBe(ROWS);
    expect(read.pages, 'the boundaries fall inside the tie').toBe(11);
    expect(read.ids).toHaveLength(ROWS);
    expect(new Set(read.ids).size, 'no row is shown twice').toBe(ROWS);
    expect([...read.ids].sort(), 'no row is missing').toEqual(await held(table));
  });
});
