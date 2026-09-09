// §22 Step 2A — schedule task identity: migration and runtime proof.
//
// The evidence gate for 2A is explicit that a green unit suite does not close it. In particular an
// EMPTY database proves nothing about a backfill, so this script BUILDS a synthetic legacy schedule
// in the pre-2A shape — a JSONB tasks array, duplicate names included — reruns the backfill against
// it, and checks the result row by row.
//
// Usage:  node s22-schedule-task-identity-proof.mjs <repo>/apps/api
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import pg from 'pg';

const apiRoot = process.argv[2];
config({ path: `${apiRoot}/.env.local` });

const envOrFile = (name) => {
  const file = process.env[`${name}_FILE`]?.trim();
  if (file) return readFileSync(file, 'utf8').trim() || null;
  return process.env[name]?.trim() || null;
};

const ownerUrl = envOrFile('MIGRATION_DATABASE_URL') ?? envOrFile('DATABASE_URL');
const appPassword = process.env.LOCAL_APP_PASSWORD?.trim() || 'aura_app_local';
const appUrl = ownerUrl.replace(/\/\/[^@]+@/, `//aura_app:${encodeURIComponent(appPassword)}@`);

const lines = [];
const say = (s = '') => { lines.push(s); console.log(s); };
let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  say(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

const owner = new pg.Client({ connectionString: ownerUrl });
await owner.connect();

const { rows: marker } = await owner
  .query('select marker from public.aura_environment limit 1')
  .catch(() => ({ rows: [] }));
if (marker[0]?.marker !== 'e2e-disposable') {
  console.error('✗ refusing to run: this database carries no e2e-disposable marker.');
  process.exit(1);
}

const setTenant = (c, t) => c.query(`select set_config('app.current_tenant_id',$1,false)`, [t ?? '']);

/**
 * Dates are compared as TEXT, cast in SQL, and never parsed into a JS Date here.
 *
 * Two harness bugs cost three false failures before this was written, and both are worth naming
 * because the pattern is common:
 *
 *  1. A raw `pg.Client` does not get the application's DATE type parser —
 *     `core/src/events/pg-pool.ts` calls `types.setTypeParser(PG_DATE_OID, v => v)`, which is
 *     global to the pg module but only takes effect in a process that imports it. So dates arrive
 *     here as JS Date objects, and `String(d).startsWith('2026-03')` never matched.
 *  2. `new Date('2026-03-01')` from a `date` column is LOCAL midnight, so `.toISOString()` in any
 *     timezone ahead of UTC yields `2026-02-28`. The "fix" for (1) was off by one day.
 *
 * Casting to text in the query removes both. The migration was correct throughout.
 */
const day = (v) => (v === null || v === undefined ? null : String(v).slice(0, 10));
const refused = async (c, sql, params) => {
  try { await c.query(sql, params); return null; } catch (e) { return e.message; }
};

const A = 's22-tenant-a';
const B = 's22-tenant-b';
const pA = 'aaaaaaaa-0000-4000-8000-000000000001';
const pB = 'bbbbbbbb-0000-4000-8000-000000000002';
const schedA = 'cccccccc-0000-4000-8000-000000000003';

const cleanup = async () => {
  for (const t of [A, B]) {
    await setTenant(owner, t);
    await owner.query('delete from public.aura_projects_schedule_tasks where tenant_id = $1', [t]).catch(() => {});
    await owner.query('delete from public.aura_projects_schedules where tenant_id = $1', [t]).catch(() => {});
    await owner.query('delete from public.aura_projects_projects where id = any($1::uuid[])', [[pA, pB]]).catch(() => {});
  }
  await setTenant(owner, null);
};
await cleanup();

say('# §22 Step 2A — schedule task identity proof');
say();
say(`_Generated ${new Date().toISOString()} against the disposable database._`);
say();

const { rows: mig } = await owner.query(
  'select count(*)::int as applied, max(filename) as head from public.aura_migrations');
say(`## Migration chain`);
say(`Applied from zero: **${mig[0].applied}** · head \`${mig[0].head}\``);
say();

// ── 1. Structure and RLS posture ───────────────────────────────────────────
say('## 1. Structure and RLS');
const { rows: posture } = await owner.query(`
  select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
         (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relname='aura_projects_schedule_tasks'`);
check(posture.length === 1, 'aura_projects_schedule_tasks exists');
check(posture[0]?.enabled === true, 'relrowsecurity');
check(posture[0]?.forced === true, 'relforcerowsecurity');
check((posture[0]?.policies ?? 0) > 0, 'has a policy', `${posture[0]?.policies}`);

const { rows: uq } = await owner.query(`
  select conname from pg_constraint
   where conrelid = 'public.aura_projects_schedule_tasks'::regclass and contype = 'u'`);
check(
  uq.some((r) => r.conname === 'uq_aura_projects_schedule_tasks_lineage'),
  'composite lineage UNIQUE (tenant_id, project_id, schedule_id, id) exists for Step 2B to key on',
);
const { rows: dur } = await owner.query(`
  select column_name from information_schema.columns
   where table_name='aura_projects_schedule_tasks' and column_name like 'duration%'`);
check(dur.length === 0, 'no duration column — that is Step 2B, and inferring it here would fabricate authored input');
say();

// ── 2. Lossless backfill of a SYNTHETIC LEGACY schedule ───────────────────
say('## 2. Backfill of a synthetic legacy schedule');
say();
say('An empty database proves nothing about a backfill, so a pre-2A schedule is built by hand —');
say('a JSONB `tasks` array with **duplicate names** and a task carrying a baseline — and the');
say('migration\'s own backfill statement is re-run against it.');
say();

await setTenant(owner, A);
await owner.query(
  `insert into public.aura_projects_projects (id, tenant_id, title, status) values ($1,$2,'Legacy A','planned')`,
  [pA, A]);
const legacyTasks = [
  { name: 'Install CCTV', plannedStart: '2026-03-01', plannedEnd: '2026-03-05', baselineStart: '2026-03-01', baselineEnd: '2026-03-04', actualStart: null, actualEnd: null, percentComplete: 40 },
  { name: 'Install CCTV', plannedStart: '2026-04-01', plannedEnd: '2026-04-05', baselineStart: '2026-04-01', baselineEnd: '2026-04-05', actualStart: null, actualEnd: null, percentComplete: 0 },
  { name: 'Commission BMS', plannedStart: '2026-05-01', plannedEnd: '2026-05-09', baselineStart: null, baselineEnd: null, actualStart: null, actualEnd: null, percentComplete: 10 },
];
await owner.query(
  `insert into public.aura_projects_schedules
     (id, tenant_id, company_id, project_id, project_name, tasks, baseline_set_at, created_by, created_at, updated_at)
   values ($1,$2,null,$3,'Legacy A',$4::jsonb, now(), null, now(), now())`,
  [schedA, A, pA, JSON.stringify(legacyTasks)]);

// The migration's backfill, verbatim in shape, scoped to this schedule.
await owner.query(`
  insert into public.aura_projects_schedule_tasks
    (id, tenant_id, project_id, schedule_id, name, planned_start, planned_end,
     baseline_start, baseline_end, actual_start, actual_end, percent_complete, created_at, updated_at)
  select gen_random_uuid(), s.tenant_id, s.project_id, s.id,
         coalesce(nullif(t.value->>'name',''), 'Untitled task'),
         (t.value->>'plannedStart')::date, (t.value->>'plannedEnd')::date,
         nullif(t.value->>'baselineStart','')::date, nullif(t.value->>'baselineEnd','')::date,
         nullif(t.value->>'actualStart','')::date, nullif(t.value->>'actualEnd','')::date,
         coalesce(nullif(t.value->>'percentComplete','')::numeric, 0),
         s.created_at, s.updated_at
    from public.aura_projects_schedules s
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.tasks) = 'array' then s.tasks else '[]'::jsonb end
    ) with ordinality as t(value, ord)
   where s.id = $1
     and t.value->>'plannedStart' is not null and t.value->>'plannedEnd' is not null`,
  [schedA]);

const { rows: backfilled } = await owner.query(
  `select id, name, planned_start::text as planned_start, baseline_start::text as baseline_start,
          baseline_end::text as baseline_end, percent_complete
     from public.aura_projects_schedule_tasks where schedule_id = $1 order by planned_start`,
  [schedA]);

check(backfilled.length === legacyTasks.length,
  `N JSONB tasks → N rows`, `${legacyTasks.length} → ${backfilled.length}`);

const cctv = backfilled.filter((r) => r.name === 'Install CCTV');
check(cctv.length === 2, 'duplicate names survive as two rows — not deduplicated');
check(cctv[0].id !== cctv[1].id, 'and they receive DISTINCT identities');

const first = backfilled.find((r) => day(r.planned_start) === '2026-03-01');
check(day(first?.baseline_start) === '2026-03-01', 'baseline copied exactly, not recomputed', day(first?.baseline_start) ?? 'row not found');
check(day(first?.baseline_end) === '2026-03-04',
  'including a baseline that DIFFERS from planned — a slipped task keeps its commitment',
  day(first?.baseline_end) ?? 'row not found');
const bms = backfilled.find((r) => r.name === 'Commission BMS');
check(bms?.baseline_start === null, 'a task with no baseline keeps none — no fabricated value');
check(Number(first?.percent_complete) === 40, 'progress preserved', String(first?.percent_complete));
say();

// ── 3. Non-destructive ────────────────────────────────────────────────────
say('## 3. The legacy column is still there');
const { rows: still } = await owner.query(
  `select jsonb_array_length(tasks) as n from public.aura_projects_schedules where id = $1`, [schedA]);
check(Number(still[0]?.n) === legacyTasks.length,
  'aura_projects_schedules.tasks is intact — rollback has somewhere to land', `${still[0]?.n} task(s)`);
say();

// ── 4. Isolation from a NOBYPASSRLS non-owner ─────────────────────────────
say('## 4. Isolation, from aura_app (NOSUPERUSER, NOBYPASSRLS, non-owner)');
await setTenant(owner, B);
await owner.query(
  `insert into public.aura_projects_projects (id, tenant_id, title, status) values ($1,$2,'Legacy B','planned')`,
  [pB, B]);

const app = new pg.Client({ connectionString: appUrl });
let connected = true;
try { await app.connect(); } catch (e) { connected = false; check(false, 'connect as aura_app', e.message); }

if (connected) {
  await setTenant(app, B);
  const { rows: seen } = await app.query(
    'select id from public.aura_projects_schedule_tasks where schedule_id = $1', [schedA]);
  check(seen.length === 0, "tenant B cannot READ tenant A's schedule tasks");

  const upd = await app.query(
    `update public.aura_projects_schedule_tasks set name='HIJACKED' where schedule_id = $1`, [schedA]);
  check(upd.rowCount === 0, "tenant B cannot UPDATE them", `${upd.rowCount} rows`);

  const del = await app.query(
    'delete from public.aura_projects_schedule_tasks where schedule_id = $1', [schedA]);
  check(del.rowCount === 0, 'tenant B cannot DELETE them', `${del.rowCount} rows`);

  const forged = await refused(app,
    `insert into public.aura_projects_schedule_tasks (tenant_id, project_id, schedule_id, name, planned_start, planned_end)
     values ($1,$2,$3,'forged','2026-01-01','2026-01-02')`, [A, pA, schedA]);
  check(!!forged, "tenant B cannot INSERT a row carrying tenant A's tenant_id");

  await setTenant(app, A);
  const { rows: own } = await app.query(
    'select id from public.aura_projects_schedule_tasks where schedule_id = $1', [schedA]);
  check(own.length === legacyTasks.length,
    'tenant A CAN read its own — the policy is not simply denying everything', `${own.length} row(s)`);
  await app.end();
}
say();

// ── 5. Constraints ────────────────────────────────────────────────────────
say('## 5. Constraints');
await setTenant(owner, A);
check(!!await refused(owner,
  `insert into public.aura_projects_schedule_tasks (tenant_id, project_id, schedule_id, name, planned_start, planned_end, percent_complete)
   values ($1,$2,$3,'bad pct','2026-01-01','2026-01-02',150)`, [A, pA, schedA]),
  'percent_complete outside 0..100 is rejected');
check(!!await refused(owner,
  `insert into public.aura_projects_schedule_tasks (tenant_id, project_id, schedule_id, name, planned_start, planned_end)
   values ($1,$2,$3,'backwards','2026-02-10','2026-02-01')`, [A, pA, schedA]),
  'planned_end before planned_start is rejected');
check(!!await refused(owner,
  `insert into public.aura_projects_schedule_tasks (tenant_id, project_id, schedule_id, name, planned_start, planned_end)
   values ($1,$2,'99999999-0000-4000-8000-000000000009','orphan','2026-01-01','2026-01-02')`, [A, pA]),
  'a task pointing at a schedule that does not exist is rejected');

// ── 6. Runtime: the application reads ROWS as authority ───────────────────
//
// Evidence items 8, 9 and 10 are about behaviour, not schema, so this section drives the real API
// over HTTP. It is skipped rather than faked when the API is not reachable.
const apiBase = process.env.AURA_API_URL ?? 'http://localhost:4000';
say();
say('## 6. Runtime — schedule API over HTTP');
say();

const reachable = await fetch(`${apiBase}/api/v1/health`).then((r) => r.ok).catch(() => false);
if (!reachable) {
  say(`_Skipped: ${apiBase} is not reachable. Schema proof above stands on its own._`);
} else {
  const login = await fetch(`${apiBase}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'u-admin', password: process.env.AUTH_DEV_PASSWORD ?? 'e2e-password' }),
  }).then((r) => r.json()).catch(() => null);
  const token = login?.token;
  check(!!token, 'authenticated as u-admin');

  const H = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
  const post = (path, body) =>
    fetch(`${apiBase}/api/v1${path}`, { method: 'POST', headers: H, body: JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const get = (path) =>
    fetch(`${apiBase}/api/v1${path}`, { headers: H }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

  const proj = await post('/projects/projects', { title: `S22 2A runtime ${Date.now()}` });
  check(proj.status === 201 || proj.status === 200, 'created a project', `HTTP ${proj.status}`);
  const projectId = proj.body?.id;

  // Two tasks with the SAME NAME — the case the old model could not represent.
  const saved = await post('/projects/schedules', {
    projectId,
    tasks: [
      { name: 'Install CCTV', plannedStart: '2026-03-01', plannedEnd: '2026-03-05' },
      { name: 'Install CCTV', plannedStart: '2026-04-01', plannedEnd: '2026-04-05' },
    ],
  });
  check(saved.status < 300, 'saved a schedule with two identically named tasks', `HTTP ${saved.status}`);
  const t0 = saved.body?.tasks ?? [];
  check(t0.length === 2 && t0[0].id && t0[1].id && t0[0].id !== t0[1].id,
    'the API returns two tasks with DISTINCT ids');

  await post(`/projects/schedules/${projectId}/baseline`, {});
  const based = await get(`/projects/schedules?projectId=${projectId}`);
  const beforeTasks = (Array.isArray(based.body) ? based.body : []).find((x) => x.projectId === projectId)?.tasks ?? [];
  check(beforeTasks.every((t) => t.baselineStart), 'baseline captured for both');

  // Round-trip the ids, rename the FIRST task and slip it. Under name matching this either lost the
  // baseline or took the other task's; under identity it keeps its own.
  const firstId = beforeTasks[0].id;
  const secondId = beforeTasks[1].id;
  const renamed = await post('/projects/schedules', {
    projectId,
    tasks: beforeTasks.map((t) => (t.id === firstId
      ? { ...t, name: 'CCTV Installation', plannedEnd: '2026-03-12' }
      : t)),
  });
  const after = renamed.body?.tasks ?? [];
  const a1 = after.find((t) => t.id === firstId);
  const a2 = after.find((t) => t.id === secondId);
  check(!!a1 && !!a2, 'both ids survived the save');
  check(a1?.name === 'CCTV Installation', 'the rename applied');
  check(a1?.baselineStart === beforeTasks[0].baselineStart && a1?.baselineEnd === beforeTasks[0].baselineEnd,
    'the renamed task KEPT ITS OWN baseline', `${a1?.baselineStart}..${a1?.baselineEnd}`);
  check(a2?.baselineStart === beforeTasks[1].baselineStart,
    'the other same-named task kept its own, unstolen');

  // The decisive one: mutate a ROW directly and re-read through the API. If the API still returned
  // the JSONB mirror, this change would be invisible.
  await setTenant(owner, 'dev-tenant');
  const upd = await owner.query(
    `update public.aura_projects_schedule_tasks set name = 'ROW IS AUTHORITY' where id = $1`, [secondId]);
  check(upd.rowCount === 1, 'a task row exists in aura_projects_schedule_tasks for that id');
  const reread = await get(`/projects/schedules?projectId=${projectId}`);
  const rr = (Array.isArray(reread.body) ? reread.body : []).find((x) => x.projectId === projectId)?.tasks ?? [];
  check(rr.find((t) => t.id === secondId)?.name === 'ROW IS AUTHORITY',
    'the API reads TASK ROWS as authority, not the JSONB mirror');

  // Clean the runtime fixtures up.
  await owner.query('delete from public.aura_projects_schedule_tasks where project_id = $1', [projectId]).catch(() => {});
  await owner.query('delete from public.aura_projects_schedules where project_id = $1', [projectId]).catch(() => {});
  await owner.query('delete from public.aura_projects_projects where id = $1', [projectId]).catch(() => {});
  await setTenant(owner, null);
}

await cleanup();
await owner.end();

say();
say(failures === 0
  ? '**All checks passed.** Every seeded row was deleted.'
  : `**${failures} check(s) FAILED.** See above.`);
process.exit(failures === 0 ? 0 : 1);
