// AURA OS — F-06 / MGT-01: the executive pipeline read is over the WHOLE book, says so, and opens to
// exactly the deals behind each figure. PostgreSQL, because only persistence has a book big enough to
// be read short — and the order it is paged in.
//
// The read used to aggregate `list({ limit: 5000 })`: the newest 5,000 opportunities of every stage.
// This seeds a tenant past that cap with the wins deliberately OLDER than 5,000 newer rows — a book
// the old read judged as having won nothing — and holds every figure against SQL over the same rows:
//   whole      decided-on-record and counted-in-window equal SQL; won/lost counts and values to the
//              cent; the old cap provably excluded every win; the read says it is complete
//   ordered    6,360 of the rows share one created_at (one INSERT), the case where ordering by
//              created_at alone repeats and drops rows between pages; the read still settles
//   drill      every reason, no-reason, competitor, account and coverage figure opens to exactly the
//              deals SQL finds for it, with the figure's count and value
//   one rate   the executive decision set's pipeline tile reads the same book whole: its open
//              pipeline and count equal SQL, and its win rate IS this read's
//   tenancy    another tenant's billion-value wins are in none of it
//   names      a deal whose account-name snapshot is missing still shows its account's name
//
// Authority is NOT proved here: the harness binds its actor through a context shim, which bypasses
// the guard. Who may read it is proved by executive-crm.security.test.ts (the permission and its
// holders) and executive-crm-population.spec.ts (browser, Auth ON: allowed and refused roles).
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
const TENANT = `f06-${RUN}`;
const OTHER = `f06-other-${RUN}`;
const ACTOR = `f06-actor-${RUN}`;
const ROLE = `f06-role-${RUN}`;

async function ownerQuery<T extends pg.QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('F-06 PostgreSQL proof requires MIGRATION_DATABASE_URL or DATABASE_URL');
  const client = new pg.Client({ connectionString: url, ssl: false });
  await client.connect();
  try { return (await client.query<T>(sql, values)).rows; } finally { await client.end(); }
}

interface ReasonRow { reason: string | null; deals: number; value: number }
interface Exec {
  period: { days: number; from: string; asOf: string };
  population: { decidedOnRecord: number; counted: number; complete: boolean };
  decided: { won: number; lost: number; wonValue: number; lostValue: number; winRate: number | null };
  winReasons: ReasonRow[];
  lossReasons: ReasonRow[];
  competitors: Array<{ name: string; lostDeals: number; lostValue: number }>;
  concentration: { top: Array<{ accountId: string; accountName: string; wonValue: number }> };
  coverage: { winsWithoutReason: number; lossesWithoutReason: number; decidedWithoutAccount: number };
}
interface Records { deals: Array<{ id: string; value: number }>; total: { deals: number; value: number }; complete: boolean }

describe('F-06 — the executive pipeline read is whole, stated, and drillable (PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let account: { id: string; name: string };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the F-06 PostgreSQL proof');
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false }));
    const access = app.get(AccessService);
    access.registerRole({ id: ROLE, name: 'F-06 proof', permissions: ['*'] });
    access.grant({ userId: ACTOR, roleId: ROLE, scope: { kind: 'org', level: 'tenant', id: TENANT } });
    const tenant = app.get(TenantContext);
    app.use((_req: unknown, _res: unknown, next: () => void) => tenant.run({
      tenantId: TENANT, companyId: `f06-company-${RUN}`, actorId: ACTOR, correlationId: `f06-${RUN}`,
    }, () => next()));
    await app.init();
    http = request(app.getHttpServer());

    account = (await http.post('/api/v1/crm/accounts').send({ name: `F06 Holdings ${RUN}` }).expect(201)).body as { id: string; name: string };

    // One statement per population: every row it writes shares one created_at.
    await ownerQuery(
      `insert into public.aura_crm_opportunities (tenant_id, title, value, stage, created_at, updated_at, account_id, account_name, loss_reason, competitors)
       select $1, 'F06 lost ' || g, (g * 10.25)::numeric, 'lost', now(), now() - make_interval(days => 1 + g % 300),
              'acct-' || (g % 7), 'Account ' || (g % 7),
              (array['Price', 'price ', 'Scope', null, '  '])[1 + g % 5],
              case g % 3 when 0 then 'Rival A, Rival B' when 1 then 'rival a' else null end
         from generate_series(1, 5200) g`, [TENANT]);
    // Decided long ago: on record, outside a 365-day window.
    await ownerQuery(
      `insert into public.aura_crm_opportunities (tenant_id, title, value, stage, created_at, updated_at, account_id, account_name, loss_reason)
       select $1, 'F06 old loss ' || g, 77, 'lost', now(), now() - interval '500 days', 'acct-1', 'Account 1', 'Price'
         from generate_series(1, 60) g`, [TENANT]);
    // The wins: created 800 days ago — older than 5,000 newer rows, so "the newest 5,000" held none.
    await ownerQuery(
      `insert into public.aura_crm_opportunities (tenant_id, title, value, stage, created_at, updated_at, account_id, account_name, win_reason)
       select $1, 'F06 won ' || g, (g * 1000.5)::numeric, 'won', now() - interval '800 days', now() - make_interval(days => 1 + g % 200),
              case when g % 10 = 0 then null else 'acct-' || (g % 5) end,
              case when g % 10 = 0 then null else 'Account ' || (g % 5) end,
              (array['Relationship', 'relationship', 'Best price', null])[1 + g % 4]
         from generate_series(1, 120) g`, [TENANT]);
    // Wins whose account-name snapshot is missing — the read must still name the account.
    await ownerQuery(
      `insert into public.aura_crm_opportunities (tenant_id, title, value, stage, created_at, updated_at, account_id, account_name, win_reason)
       select $1, 'F06 unnamed win ' || g, 9000000, 'won', now() - interval '800 days', now() - interval '5 days', $2, null, 'Relationship'
         from generate_series(1, 3) g`, [TENANT, account.id]);
    await ownerQuery(
      `insert into public.aura_crm_opportunities (tenant_id, title, value, stage, created_at, updated_at)
       select $1, 'F06 open ' || g, (g * 3.5)::numeric, (array['qualification', 'proposal', 'negotiation'])[1 + g % 3], now(), now() - interval '1 day'
         from generate_series(1, 1100) g`, [TENANT]);
    await ownerQuery(
      `insert into public.aura_crm_opportunities (tenant_id, title, value, stage, created_at, updated_at, win_reason)
       select $1, 'F06 other tenant ' || g, 1000000000, 'won', now(), now() - interval '2 days', 'Relationship'
         from generate_series(1, 40) g`, [OTHER]);
  }, 180_000);

  afterAll(async () => {
    await ownerQuery('delete from public.aura_crm_opportunities where tenant_id = any($1)', [[TENANT, OTHER]]).catch(() => undefined);
    await app?.close();
  });

  const sqlCount = async (where: string, values: unknown[]): Promise<number> =>
    Number((await ownerQuery<{ n: string }>(`select count(*)::text as n from public.aura_crm_opportunities where tenant_id = $1 and ${where}`, [TENANT, ...values]))[0].n);
  const sqlSum = async (where: string, values: unknown[]): Promise<number> =>
    Number((await ownerQuery<{ v: string }>(`select coalesce(round(sum(value), 2), 0)::text as v from public.aura_crm_opportunities where tenant_id = $1 and ${where}`, [TENANT, ...values]))[0].v);
  const sqlIds = async (where: string, values: unknown[]): Promise<string[]> =>
    (await ownerQuery<{ id: string }>(`select id::text from public.aura_crm_opportunities where tenant_id = $1 and ${where} order by id`, [TENANT, ...values])).map((r) => r.id);

  it('reads every decided deal past the old 5,000 cap, states it, and reconciles to SQL to the cent', async () => {
    expect(await sqlCount('true', [])).toBe(6_483);
    // What the old read saw: the newest 5,000 rows held not one win.
    const oldRead = await ownerQuery<{ won: string }>(
      `select count(*) filter (where stage = 'won')::text as won from (
         select stage from public.aura_crm_opportunities where tenant_id = $1 order by created_at desc limit 5000) newest`, [TENANT]);
    expect(oldRead[0].won, 'the capped read would have reported no wins at all').toBe('0');

    const r = (await http.get('/api/v1/crm/executive?days=365').expect(200)).body as Exec;
    const inWindow = `stage in ('won','lost') and updated_at >= $2::timestamptz and updated_at <= $3::timestamptz`;
    const w = [r.period.from, r.period.asOf];

    expect(r.population.complete).toBe(true);
    expect(r.population.decidedOnRecord).toBe(await sqlCount(`stage in ('won','lost')`, []));
    expect(r.population.decidedOnRecord).toBe(5_383);
    expect(r.population.counted).toBe(await sqlCount(inWindow, w));
    expect(r.decided.won).toBe(await sqlCount(`${inWindow} and stage = 'won'`, w));
    expect(r.decided.won).toBe(123);
    expect(r.decided.lost).toBe(await sqlCount(`${inWindow} and stage = 'lost'`, w));
    expect(r.decided.lost).toBe(5_200);
    expect(r.decided.wonValue).toBe(await sqlSum(`${inWindow} and stage = 'won'`, w));
    expect(r.decided.lostValue).toBe(await sqlSum(`${inWindow} and stage = 'lost'`, w));
    // Not one of the other tenant's billion-value wins.
    expect(r.decided.wonValue).toBeLessThan(1_000_000_000);

    // A missing name snapshot still reads as the account's name, not its id.
    expect(r.concentration.top.find((t) => t.accountId === account.id)?.accountName).toBe(account.name);
  });

  it('opens every figure to exactly the deals SQL finds for it, with the figure\'s count and value', async () => {
    const r = (await http.get('/api/v1/crm/executive?days=365').expect(200)).body as Exec;
    const w = [r.period.from, r.period.asOf];
    const inWindow = `stage in ('won','lost') and updated_at >= $2::timestamptz and updated_at <= $3::timestamptz`;
    const drill = async (query: Record<string, string>): Promise<Records> =>
      (await http.get('/api/v1/crm/executive/records').query({ days: '365', asOf: r.period.asOf, ...query }).expect(200)).body as Records;
    const ids = (d: Records) => d.deals.map((x) => x.id).sort();

    const lost = await drill({ by: 'decided', outcome: 'lost' });
    expect(lost.total).toEqual({ deals: r.decided.lost, value: r.decided.lostValue });
    expect(lost.complete).toBe(true);

    for (const row of r.lossReasons) {
      const d = await drill(row.reason === null ? { by: 'no-reason', outcome: 'lost' } : { by: 'reason', outcome: 'lost', reason: row.reason });
      expect(d.total, `lost · ${row.reason}`).toEqual({ deals: row.deals, value: row.value });
      const where = row.reason === null
        ? `${inWindow} and stage = 'lost' and coalesce(btrim(loss_reason), '') = ''`
        : `${inWindow} and stage = 'lost' and lower(btrim(loss_reason)) = lower(btrim($4))`;
      expect(ids(d), `lost · ${row.reason}`).toEqual(await sqlIds(where, row.reason === null ? w : [...w, row.reason]));
    }
    // "Price" and "price " are one reason, as typed first.
    expect(r.lossReasons.find((x) => x.reason?.toLowerCase() === 'price')?.deals).toBe(await sqlCount(`${inWindow} and stage = 'lost' and lower(btrim(loss_reason)) = 'price'`, w));

    for (const row of r.winReasons) {
      const d = await drill(row.reason === null ? { by: 'no-reason', outcome: 'won' } : { by: 'reason', outcome: 'won', reason: row.reason });
      expect(d.total, `won · ${row.reason}`).toEqual({ deals: row.deals, value: row.value });
    }

    for (const c of r.competitors) {
      const d = await drill({ by: 'competitor', name: c.name });
      expect(d.total, c.name).toEqual({ deals: c.lostDeals, value: c.lostValue });
      expect(ids(d), c.name).toEqual(await sqlIds(
        `${inWindow} and stage = 'lost' and exists (select 1 from unnest(string_to_array(competitors, ',')) n where lower(btrim(n)) = lower($4))`, [...w, c.name]));
    }
    expect(r.competitors.find((c) => c.name.toLowerCase() === 'rival a')?.lostDeals).toBe(await sqlCount(`${inWindow} and stage = 'lost' and competitors is not null`, w));

    for (const t of r.concentration.top) {
      const d = await drill({ by: 'account', accountId: t.accountId });
      expect(d.total.value, t.accountName).toBe(t.wonValue);
      expect(ids(d), t.accountName).toEqual(await sqlIds(`${inWindow} and stage = 'won' and account_id = $4`, [...w, t.accountId]));
    }

    const noAccount = await drill({ by: 'no-account' });
    expect(noAccount.total.deals).toBe(r.coverage.decidedWithoutAccount);
    expect(ids(noAccount)).toEqual(await sqlIds(`${inWindow} and account_id is null`, w));
  });

  it('refuses a drill it cannot answer rather than guessing one', async () => {
    const bad = async (query: Record<string, string>, message: string) => {
      const res = await http.get('/api/v1/crm/executive/records').query(query);
      expect(res.status, JSON.stringify(query)).toBe(400);
      expect(String(res.body?.message)).toContain(message);
    };
    await bad({ by: 'reason', outcome: 'lost' }, 'requires the reason');
    await bad({ by: 'reason', outcome: 'maybe', reason: 'Price' }, 'outcome must be won or lost');
    await bad({ by: 'everything' }, 'unknown drill');
    await bad({ asOf: 'yesterday-ish' }, 'is not a date');
  });

  it('the decision set reads the same book whole: open pipeline to SQL, and the same win rate', async () => {
    const r = (await http.get('/api/v1/crm/executive?days=365').expect(200)).body as Exec;
    const tile = (await http.get('/api/v1/intelligence/executive-decisions/pipeline').expect(200)).body as {
      figures: Array<{ label: string; value: number }>;
      records: unknown[];
      population: { counted: number; excluded: unknown[] };
    };
    const figure = (label: string) => tile.figures.find((f) => f.label === label)?.value;
    const open = `stage in ('qualification','proposal','negotiation')`;
    expect(figure('Open deals')).toBe(await sqlCount(open, []));
    expect(figure('Open deals')).toBe(1_100);
    expect(figure('Open pipeline')).toBe(await sqlSum(open, []));
    expect(tile.records).toHaveLength(1_100);
    expect(tile.population).toMatchObject({ counted: 1_100, excluded: [] });
    expect(figure('Win rate, last 365 days'), 'one business, one win rate').toBe(r.decided.winRate);
  });
});
