#!/usr/bin/env node
/*
 * Radar-only release proof.  The CI job that invokes this script provisions a throwaway
 * pgvector/pg16 database, applies migrations as the owner, and connects here as aura_app for
 * reads/mutations.  This is deliberately a proof harness, not product code.
 */
import crypto from 'node:crypto';
import pg from 'pg';

const ownerUrl = process.env.OWNER_URL;
const appUrl = process.env.APP_DATABASE_URL;
const apiBase = process.env.AURA_API_URL ?? 'http://localhost:4000';
const tenantA = process.env.RADAR_PROOF_TENANT ?? 'radar-proof-a';
const tenantB = `${tenantA}-foreign`;
const company = 'radar-proof-company';
const count = Number(process.env.RADAR_PROOF_SIGNAL_COUNT ?? 6_001);
if (!ownerUrl || !appUrl) throw new Error('OWNER_URL and APP_DATABASE_URL are required');
if (!Number.isInteger(count) || count <= 5_000) throw new Error('RADAR_PROOF_SIGNAL_COUNT must exceed 5000');

const owner = new pg.Pool({ connectionString: ownerUrl, max: 4 });
const app = new pg.Pool({ connectionString: appUrl, max: 8 });
const uuid = (name) => crypto.createHash('md5').update(name).digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
const log = (message) => console.log(`[radar-proof] ${message}`);
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function seed() {
  await owner.query(`
    INSERT INTO public.aura_crm_signals
      (id, tenant_id, company_id, title, description, source, type, account_name, evidence,
       confidence, detected_at, owner_id, status)
    SELECT md5('radar-proof-signal-' || g)::uuid, $1, $2,
           'Radar Proof Signal ' || g,
           'Release proof signal ' || g,
           CASE WHEN g % 4 = 0 THEN 'MANUAL' WHEN g % 4 = 1 THEN 'RELATIONSHIP' WHEN g % 4 = 2 THEN 'MARKET' ELSE 'INBOUND' END,
           CASE WHEN g % 4 = 0 THEN 'NEW_PROJECT' WHEN g % 4 = 1 THEN 'EXPANSION' WHEN g % 4 = 2 THEN 'MARKET_EVENT' ELSE 'RFQ_RECEIVED' END,
           CASE WHEN g % 2 = 0 THEN 'Radar Proof Account A' ELSE 'Radar Proof Account B' END,
           'Evidence for Radar release proof',
           (g % 100), now() - make_interval(days => (g % 180)),
           CASE WHEN g % 3 = 0 THEN 'u-admin' ELSE NULL END,
           CASE WHEN g % 11 = 0 THEN 'REVIEWING' WHEN g % 7 = 0 THEN 'RESEARCHING' ELSE 'NEW' END
    FROM generate_series(1, $3::int) g
    ON CONFLICT (id) DO NOTHING`, [tenantA, company, count]);
  await owner.query(`
    INSERT INTO public.aura_crm_signals
      (id, tenant_id, company_id, title, source, type, confidence, detected_at, status)
    VALUES ($1, $2, $3, 'Radar Proof Foreign Signal', 'MANUAL', 'OTHER', 80, now(), 'NEW')
    ON CONFLICT (id) DO NOTHING`, [uuid('radar-proof-foreign'), tenantB, company]);
  await owner.query(`
    INSERT INTO public.aura_crm_signals
      (id, tenant_id, company_id, title, source, type, confidence, detected_at, status)
    VALUES ($1, $2, $3, 'Radar Proof Promotion Signal', 'MANUAL', 'NEW_PROJECT', 90, now(), 'NEW')
    ON CONFLICT (id) DO NOTHING`, [uuid('radar-proof-promotion'), tenantA, company]);
  log(`seeded ${count + 2} signals (${count + 1} in ${tenantA}, 1 in ${tenantB})`);
}

async function rlsProof() {
  const client = await app.connect();
  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantA]);
    const role = await client.query(`SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`);
    assert(role.rows[0] && !role.rows[0].rolsuper && !role.rows[0].rolbypassrls, 'runtime role bypasses RLS');
    const own = await client.query('SELECT count(*)::int AS n FROM public.aura_crm_signals WHERE tenant_id = $1', [tenantA]);
    const foreign = await client.query('SELECT count(*)::int AS n FROM public.aura_crm_signals WHERE tenant_id = $1', [tenantB]);
    const update = await client.query('UPDATE public.aura_crm_signals SET title = $1 WHERE id = $2', ['forged', uuid('radar-proof-foreign')]);
    const search = await client.query(`SELECT count(*)::int AS n FROM public.aura_crm_signals WHERE title ILIKE '%Foreign Signal%'`);
    const summary = await client.query(`SELECT count(*)::int AS n FROM public.aura_crm_signals`);
    const exported = await client.query(`SELECT id FROM public.aura_crm_signals ORDER BY detected_at DESC, id DESC`);
    assert(own.rows[0].n >= count + 1, `own-tenant rows missing: ${own.rows[0].n}`);
    assert(foreign.rows[0].n === 0 && update.rowCount === 0 && search.rows[0].n === 0, 'cross-tenant RLS leak');
    assert(summary.rows[0].n === count + 1 && exported.rows.every((row) => row.id !== uuid('radar-proof-foreign')), 'RLS summary/export leak');
    log(`effective-role RLS passed for ${role.rows[0].current_user}`);
  } finally { client.release(); }
}

async function apiJson(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  const text = await response.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function apiProof() {
  let login;
  for (let attempt = 1; attempt <= 10; attempt++) {
    login = await apiJson('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ username: 'u-admin', password: process.env.AUTH_DEV_PASSWORD ?? 'e2e-password' }) });
    if (login.response.ok && login.body?.token) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  assert(login?.response.ok && login.body?.token, `Radar proof login failed (${login?.response.status ?? 'network'}) body=${JSON.stringify(login?.body)}`);
  const headers = { authorization: `Bearer ${login.body.token}` };
  const page = async (offset, query = '') => (await apiJson(`/api/v1/crm/signals/radar?limit=50&offset=${offset}${query}`, { headers })).body;
  const first = await page(0);
  const deep = await page(5_950);
  const final = await page((count + 1) - 50);
  const searched = await page(0, '&search=Radar%20Proof%20Signal%206001');
  const filtered = await page(0, '&source=MANUAL&type=NEW_PROJECT');
  assert(first?.page?.total === count + 1, `radar total mismatch: ${first?.page?.total}; response=${JSON.stringify(first).slice(0, 1200)}`);
  assert(first.page.items.length === 50 && deep.page.items.length === 50 && final.page.hasMore === false, 'pagination invariant failed');
  assert(searched.page.items.some((row) => row.title === 'Radar Proof Signal 6001'), 'deep search failed');
  assert(filtered.page.total > 50, 'combined filter did not exceed one page');
  assert(JSON.stringify(first.summary) === JSON.stringify((await page(50)).summary), 'summary depends on page');
  const exportResponse = await fetch(`${apiBase}/api/v1/crm/signals/radar/export`, { headers });
  assert(exportResponse.ok, `Radar export failed (${exportResponse.status})`);
  const csv = (await exportResponse.text()).trim().split('\n');
  assert(csv.length - 1 === count + 1, `export count mismatch: ${csv.length - 1}`);
  const invalid = await apiJson('/api/v1/crm/signals', { method: 'POST', headers, body: JSON.stringify({ title: 'invalid reference', source: 'MANUAL', type: 'OTHER', accountId: uuid('missing-account') }) });
  assert(invalid.response.status === 400, `invalid reference accepted (${invalid.response.status})`);
  const foreign = await apiJson(`/api/v1/crm/signals/${uuid('radar-proof-foreign')}/promote`, { method: 'POST', headers, body: '{}' });
  assert([403, 404].includes(foreign.response.status), `cross-tenant promotion returned ${foreign.response.status}`);
  const promote = await apiJson(`/api/v1/crm/signals/${uuid('radar-proof-promotion')}/promote`, { method: 'POST', headers, body: '{}' });
  assert(promote.response.ok && promote.body?.lead?.signalId === uuid('radar-proof-promotion') && promote.body?.signal?.status === 'PROMOTED', 'promotion lineage failed');
  const replay = await apiJson(`/api/v1/crm/signals/${uuid('radar-proof-promotion')}/promote`, { method: 'POST', headers, body: '{}' });
  assert(replay.response.ok && replay.body?.idempotentReplay === true, 'promotion replay failed');
  log(`API proof passed: page=${first.page.total}, deepSearch=${searched.page.items.length}, export=${csv.length - 1}`);
}

async function sqlProof() {
  const client = await owner.connect();
  try {
    const indexes = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('idx_crm_signals_tenant_detected','idx_crm_signals_tenant_owner_detected')`);
    assert(indexes.rowCount === 2, 'migration 0266 indexes are missing');
    const plans = [
      ['tenant/status', `SELECT id FROM public.aura_crm_signals WHERE tenant_id = '${tenantA}' AND status = 'NEW' ORDER BY detected_at DESC, id DESC LIMIT 50`],
      ['source/type', `SELECT id FROM public.aura_crm_signals WHERE tenant_id = '${tenantA}' AND source = 'MANUAL' AND type = 'NEW_PROJECT' ORDER BY detected_at DESC, id DESC LIMIT 50`],
      ['owner', `SELECT id FROM public.aura_crm_signals WHERE tenant_id = '${tenantA}' AND owner_id = 'u-admin' ORDER BY detected_at DESC, id DESC LIMIT 50`],
      ['date', `SELECT id FROM public.aura_crm_signals WHERE tenant_id = '${tenantA}' AND detected_at >= now() - interval '30 days' ORDER BY detected_at DESC, id DESC LIMIT 50`],
      ['search', `SELECT id FROM public.aura_crm_signals WHERE tenant_id = '${tenantA}' AND (title ILIKE '%6001%' OR description ILIKE '%6001%' OR account_name ILIKE '%6001%' OR evidence ILIKE '%6001%') ORDER BY detected_at DESC, id DESC LIMIT 50`],
      ['summary', `SELECT count(*) FROM public.aura_crm_signals WHERE tenant_id = '${tenantA}'`],
      ['paged', `SELECT id FROM public.aura_crm_signals WHERE tenant_id = '${tenantA}' ORDER BY detected_at DESC, id DESC LIMIT 50 OFFSET 5950`],
    ];
    for (const [label, sql] of plans) {
      const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`);
      const plan = result.rows[0]['QUERY PLAN'][0];
      log(`EXPLAIN ${label}: ${plan['Execution Time']} ms; ${plan.Plan['Node Type']}`);
    }
    log('0266 indexes and query-plan evidence passed');
  } finally { client.release(); }
}

try {
  log('stage=seed');
  await seed();
  log('stage=rls');
  await rlsProof();
  log('stage=api');
  await apiProof();
  log('stage=plans');
  await sqlProof();
  log('result=pass');
} catch (error) {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[radar-proof] result=fail ${detail}`);
  // Emit the first failure as a GitHub annotation so a proof-only failure remains diagnosable
  // without exposing database credentials or requiring privileged log-download access.
  process.stdout.write(`::error title=Radar proof failure::${detail.replace(/\r?\n/g, '%0A').slice(0, 4000)}\n`);
  process.exitCode = 1;
} finally {
  await owner.query('DELETE FROM public.aura_crm_leads WHERE signal_id IN ($1,$2)', [uuid('radar-proof-promotion'), uuid('radar-proof-foreign')]).catch(() => undefined);
  await owner.query('DELETE FROM public.aura_crm_signals WHERE tenant_id IN ($1,$2)', [tenantA, tenantB]).catch(() => undefined);
  await owner.end();
  await app.end();
}
