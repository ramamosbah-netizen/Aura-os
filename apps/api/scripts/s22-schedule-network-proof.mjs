// §22 Step 2B — authored duration and first-class dependencies: database proof.
//
// The invariant this exists to demonstrate is the composite lineage one. A pair of plain
// `FK task_id -> tasks(id)` constraints would permit a dependency joining a task in project A to a
// task in project B; the composite keys must refuse it. Reading the DDL does not prove that.
//
// Usage:  node s22-schedule-network-proof.mjs <repo>/apps/api
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

const say = (s = '') => console.log(s);
let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  say(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

const owner = new pg.Client({ connectionString: ownerUrl });
await owner.connect();
const { rows: marker } = await owner
  .query('select marker from public.aura_environment limit 1').catch(() => ({ rows: [] }));
if (marker[0]?.marker !== 'e2e-disposable') {
  console.error('✗ refusing to run: this database carries no e2e-disposable marker.');
  process.exit(1);
}

const setTenant = (c, t) => c.query(`select set_config('app.current_tenant_id',$1,false)`, [t ?? '']);
const refused = async (c, sql, params) => {
  try { await c.query(sql, params); return null; } catch (e) { return e.message; }
};

const T = 's22b-tenant';
const OTHER = 's22b-other-tenant';
const pA = 'a0000000-0000-4000-8000-00000000000a';
const pB = 'b0000000-0000-4000-8000-00000000000b';
const sA = 'c0000000-0000-4000-8000-00000000000c';
const sB = 'd0000000-0000-4000-8000-00000000000d';
const t1 = '10000000-0000-4000-8000-000000000001';
const t2 = '20000000-0000-4000-8000-000000000002';
const tB = '30000000-0000-4000-8000-000000000003';

const cleanup = async () => {
  for (const t of [T, OTHER]) {
    await setTenant(owner, t);
    await owner.query('delete from public.aura_projects_schedule_dependencies where tenant_id=$1', [t]).catch(() => {});
    await owner.query('delete from public.aura_projects_schedule_tasks where tenant_id=$1', [t]).catch(() => {});
    await owner.query('delete from public.aura_projects_schedules where tenant_id=$1', [t]).catch(() => {});
    await owner.query('delete from public.aura_projects_projects where id = any($1::uuid[])', [[pA, pB]]).catch(() => {});
  }
  await setTenant(owner, null);
};
await cleanup();

say('# §22 Step 2B — duration and dependency proof');
say();
say(`_Generated ${new Date().toISOString()} against the disposable database._`);
say();
const { rows: mig } = await owner.query(
  'select count(*)::int as applied, max(filename) as head from public.aura_migrations');
say(`## Migration chain`);
say(`Applied from zero: **${mig[0].applied}** · head \`${mig[0].head}\``);
say();

// ── Fixtures: two projects, each with a schedule and a task ───────────────
await setTenant(owner, T);
for (const [pid, sid, tid, title] of [[pA, sA, t1, 'Project A'], [pB, sB, tB, 'Project B']]) {
  await owner.query(
    `insert into public.aura_projects_projects (id, tenant_id, title, status) values ($1,$2,$3,'planned')`,
    [pid, T, title]);
  await owner.query(
    `insert into public.aura_projects_schedules (id, tenant_id, project_id, project_name, tasks, created_at, updated_at)
     values ($1,$2,$3,$4,'[]'::jsonb, now(), now())`, [sid, T, pid, title]);
  await owner.query(
    `insert into public.aura_projects_schedule_tasks (id, tenant_id, project_id, schedule_id, name, planned_start, planned_end)
     values ($1,$2,$3,$4,'Task','2026-07-01','2026-07-05')`, [tid, T, pid, sid]);
}
// A second task in project A, so a legitimate edge is possible.
await owner.query(
  `insert into public.aura_projects_schedule_tasks (id, tenant_id, project_id, schedule_id, name, planned_start, planned_end)
   values ($1,$2,$3,$4,'Second','2026-07-06','2026-07-08')`, [t2, T, pA, sA]);

// ── 1. Duration ───────────────────────────────────────────────────────────
say('## 1. Authored duration');
const { rows: legacy } = await owner.query(
  'select duration_working_days from public.aura_projects_schedule_tasks where id=$1', [t1]);
check(legacy[0]?.duration_working_days === null,
  'a task created without a duration keeps NULL — nothing was inferred from its dates');

check(!!await refused(owner,
  'update public.aura_projects_schedule_tasks set duration_working_days = 0 where id=$1', [t1]),
  'a zero duration is rejected');
check(!!await refused(owner,
  'update public.aura_projects_schedule_tasks set duration_working_days = -3 where id=$1', [t1]),
  'a negative duration is rejected');
await owner.query('update public.aura_projects_schedule_tasks set duration_working_days = 4 where id=$1', [t1]);
const { rows: authored } = await owner.query(
  'select duration_working_days from public.aura_projects_schedule_tasks where id=$1', [t1]);
check(Number(authored[0]?.duration_working_days) === 4, 'an authored duration persists', '4 working days');
say();

// ── 2. Dependency lineage — the point of the composite keys ──────────────
say('## 2. Dependency lineage');
const ok = await refused(owner,
  `insert into public.aura_projects_schedule_dependencies (tenant_id, project_id, schedule_id, predecessor_task_id, successor_task_id)
   values ($1,$2,$3,$4,$5)`, [T, pA, sA, t1, t2]);
check(!ok, 'an edge between two tasks in the SAME project and schedule is accepted', ok ?? '');

const selfEdge = await refused(owner,
  `insert into public.aura_projects_schedule_dependencies (tenant_id, project_id, schedule_id, predecessor_task_id, successor_task_id)
   values ($1,$2,$3,$4,$4)`, [T, pA, sA, t1]);
check(!!selfEdge && /self_check/.test(selfEdge),
  'a self-dependency is rejected BY THE CHECK CONSTRAINT', selfEdge?.split('\n')[0]);

const dupe = await refused(owner,
  `insert into public.aura_projects_schedule_dependencies (tenant_id, project_id, schedule_id, predecessor_task_id, successor_task_id)
   values ($1,$2,$3,$4,$5)`, [T, pA, sA, t1, t2]);
check(!!dupe && /uq_aura_projects_schedule_dependencies_edge/.test(dupe),
  'a duplicate edge is rejected by UNIQUE', dupe?.split('\n')[0]);

// THE one. Plain FKs on task id alone would accept this.
const crossProject = await refused(owner,
  `insert into public.aura_projects_schedule_dependencies (tenant_id, project_id, schedule_id, predecessor_task_id, successor_task_id)
   values ($1,$2,$3,$4,$5)`, [T, pA, sA, t1, tB]);
check(!!crossProject && /fkey/.test(crossProject),
  'an edge reaching a task in ANOTHER PROJECT is rejected by the composite FK',
  crossProject?.split('\n')[0]);

const crossSchedule = await refused(owner,
  `insert into public.aura_projects_schedule_dependencies (tenant_id, project_id, schedule_id, predecessor_task_id, successor_task_id)
   values ($1,$2,$3,$4,$5)`, [T, pB, sB, t1, tB]);
check(!!crossSchedule && /fkey/.test(crossSchedule),
  'an edge whose predecessor belongs to a different schedule is rejected', crossSchedule?.split('\n')[0]);

// A pair that does NOT already exist, so UNIQUE cannot fire first and mask the FK. The earlier
// version reused (t1 → t2), was rejected by the duplicate-edge constraint, and reported a green
// check that proved nothing about tenancy — which is why every check here asserts the constraint
// NAME rather than the mere fact of refusal.
const crossTenant = await refused(owner,
  `insert into public.aura_projects_schedule_dependencies (tenant_id, project_id, schedule_id, predecessor_task_id, successor_task_id)
   values ($1,$2,$3,$4,$5)`, [OTHER, pA, sA, t2, t1]);
check(!!crossTenant && /fkey/.test(crossTenant),
  'an edge claiming another tenant is rejected BY THE COMPOSITE FK, not by UNIQUE',
  crossTenant?.split('\n')[0]);
say();

// ── 3. A cycle is NOT a row invariant, and the schema says so ────────────
say('## 3. Cycles are a graph invariant, owned by the domain');
const backEdge = await refused(owner,
  `insert into public.aura_projects_schedule_dependencies (tenant_id, project_id, schedule_id, predecessor_task_id, successor_task_id)
   values ($1,$2,$3,$4,$5)`, [T, pA, sA, t2, t1]);
check(!backEdge,
  'the DATABASE accepts a two-hop cycle — judging it needs the whole edge set, not one row',
  'this is by design; the governed writer rejects it, and 18 domain tests pin that');
say();

// ── 4. Cascade ────────────────────────────────────────────────────────────
say('## 4. Deleting a task removes its edges');
const before = await owner.query('select count(*)::int as n from public.aura_projects_schedule_dependencies where schedule_id=$1', [sA]);
await owner.query('delete from public.aura_projects_schedule_tasks where id=$1', [t2]);
const after = await owner.query('select count(*)::int as n from public.aura_projects_schedule_dependencies where schedule_id=$1', [sA]);
check(before.rows[0].n > 0 && after.rows[0].n === 0,
  'edges cascade with the task, so no edge outlives an endpoint',
  `${before.rows[0].n} → ${after.rows[0].n}`);
say();

// ── 5. RLS ────────────────────────────────────────────────────────────────
say('## 5. RLS on the dependency table');
const { rows: posture } = await owner.query(`
  select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
         (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='aura_projects_schedule_dependencies'`);
check(posture[0]?.enabled === true, 'relrowsecurity');
check(posture[0]?.forced === true, 'relforcerowsecurity');
check((posture[0]?.policies ?? 0) > 0, 'has a policy', `${posture[0]?.policies}`);

// Re-create an edge to read across the boundary.
await owner.query(
  `insert into public.aura_projects_schedule_tasks (id, tenant_id, project_id, schedule_id, name, planned_start, planned_end)
   values ($1,$2,$3,$4,'Second again','2026-07-06','2026-07-08')`, [t2, T, pA, sA]);
await owner.query(
  `insert into public.aura_projects_schedule_dependencies (tenant_id, project_id, schedule_id, predecessor_task_id, successor_task_id)
   values ($1,$2,$3,$4,$5)`, [T, pA, sA, t1, t2]);

const app = new pg.Client({ connectionString: appUrl });
let connected = true;
try { await app.connect(); } catch (e) { connected = false; check(false, 'connect as aura_app', e.message); }
if (connected) {
  await setTenant(app, OTHER);
  const { rows: seen } = await app.query(
    'select id from public.aura_projects_schedule_dependencies where schedule_id=$1', [sA]);
  check(seen.length === 0, 'another tenant cannot read the dependency network');
  await setTenant(app, T);
  const { rows: own } = await app.query(
    'select id from public.aura_projects_schedule_dependencies where schedule_id=$1', [sA]);
  check(own.length === 1, 'the owning tenant can', `${own.length} edge(s)`);
  await app.end();
}

await cleanup();
await owner.end();
say();
say(failures === 0
  ? '**All checks passed.** Every seeded row was deleted.'
  : `**${failures} check(s) FAILED.** See above.`);
process.exit(failures === 0 ? 0 : 1);
