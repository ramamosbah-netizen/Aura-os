// §22 Step 5 — task resource requirements: database proof.
//
// Demand is the first of the four facts the gate insists never collapse into one another
// (Demand ≠ Capacity ≠ Booking ≠ Actual). What the database must guarantee is that a requirement
// cannot escape its task's project, cannot be recorded twice for one resource, and cannot claim
// zero.
//
// Usage:  node s22-task-requirements-proof.mjs <repo>/apps/api
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import pg from 'pg';

const apiRoot = process.argv[2];
config({ path: `${apiRoot}/.env.local` });
const envOrFile = (n) => {
  const f = process.env[`${n}_FILE`]?.trim();
  if (f) return readFileSync(f, 'utf8').trim() || null;
  return process.env[n]?.trim() || null;
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

const T = 's22e-tenant';
const OTHER = 's22e-other';
const pA = 'a1000000-0000-4000-8000-00000000000a';
const pB = 'b1000000-0000-4000-8000-00000000000b';
const sA = 'c1000000-0000-4000-8000-00000000000c';
const sB = 'd1000000-0000-4000-8000-00000000000d';
const tA = '11100000-0000-4000-8000-000000000001';
const tB = '22200000-0000-4000-8000-000000000002';

const cleanup = async () => {
  for (const t of [T, OTHER]) {
    await setTenant(owner, t);
    await owner.query('delete from public.aura_projects_task_requirements where tenant_id=$1', [t]).catch(() => {});
    await owner.query('delete from public.aura_projects_schedule_tasks where tenant_id=$1', [t]).catch(() => {});
    await owner.query('delete from public.aura_projects_schedules where tenant_id=$1', [t]).catch(() => {});
    await owner.query('delete from public.aura_projects_projects where id = any($1::uuid[])', [[pA, pB]]).catch(() => {});
  }
  await setTenant(owner, null);
};
await cleanup();

say('# §22 Step 5 — task requirement proof');
say();
say(`_Generated ${new Date().toISOString()} against the disposable database._`);
say();
const { rows: mig } = await owner.query(
  'select count(*)::int as applied, max(filename) as head from public.aura_migrations');
say('## Migration chain');
say(`Applied from zero: **${mig[0].applied}** · head \`${mig[0].head}\``);
say();

await setTenant(owner, T);
for (const [pid, sid, tid, title] of [[pA, sA, tA, 'Project A'], [pB, sB, tB, 'Project B']]) {
  await owner.query(
    `insert into public.aura_projects_projects (id, tenant_id, title, status) values ($1,$2,$3,'planned')`, [pid, T, title]);
  await owner.query(
    `insert into public.aura_projects_schedules (id, tenant_id, project_id, project_name, tasks, created_at, updated_at)
     values ($1,$2,$3,$4,'[]'::jsonb, now(), now())`, [sid, T, pid, title]);
  await owner.query(
    `insert into public.aura_projects_schedule_tasks (id, tenant_id, project_id, schedule_id, name, planned_start, planned_end)
     values ($1,$2,$3,$4,'Task','2026-07-01','2026-07-05')`, [tid, T, pid, sid]);
}

const req = (params) => owner.query(
  `insert into public.aura_projects_task_requirements
     (tenant_id, project_id, schedule_id, task_id, resource_type, canonical_resource_id, unit, quantity)
   values ($1,$2,$3,$4,$5,$6,$7,$8)`, params);
const reqRefused = (params) => refused(owner,
  `insert into public.aura_projects_task_requirements
     (tenant_id, project_id, schedule_id, task_id, resource_type, canonical_resource_id, unit, quantity)
   values ($1,$2,$3,$4,$5,$6,$7,$8)`, params);

say('## 1. Several requirements per task');
await req([T, pA, sA, tA, 'pool', 'elv-tech', 'persons', 4]);
await req([T, pA, sA, tA, 'pool', 'rigger', 'persons', 2]);
await req([T, pA, sA, tA, 'asset', 'CR-01', 'units', 1]);
const { rows: many } = await owner.query(
  'select count(*)::int as n from public.aura_projects_task_requirements where task_id=$1', [tA]);
check(many[0].n === 3,
  'one task holds a crew AND a rigger AND a crane — the shape a single resource column could not express',
  `${many[0].n} requirements`);

const sameIdDifferentType = await reqRefused([T, pA, sA, tA, 'vehicle', 'CR-01', 'units', 1]);
check(!sameIdDifferentType,
  'the same id under a different TYPE is a different resource, and is accepted', sameIdDifferentType ?? '');
say();

say('## 2. Constraints');
const dupe = await reqRefused([T, pA, sA, tA, 'asset', 'CR-01', 'units', 1]);
check(!!dupe && /uq_aura_projects_task_requirements_resource/.test(dupe),
  'the same resource twice on one task is rejected — the planner would count both',
  dupe?.split('\n')[0]);

const zero = await reqRefused([T, pA, sA, tA, 'pool', 'zero-demand', 'persons', 0]);
check(!!zero && /quantity_check/.test(zero),
  'a requirement for zero is rejected — that is the absence of demand, not demand', zero?.split('\n')[0]);

const negative = await reqRefused([T, pA, sA, tA, 'pool', 'negative', 'persons', -1]);
check(!!negative && /quantity_check/.test(negative), 'a negative requirement is rejected');

const badType = await reqRefused([T, pA, sA, tA, 'crane', 'CR-02', 'units', 1]);
check(!!badType && /type_check/.test(badType),
  'an unknown resource type is rejected — a reference is typed, never free text');

const badUnit = await reqRefused([T, pA, sA, tA, 'pool', 'u', 'people', 1]);
check(!!badUnit && /unit_check/.test(badUnit), 'an unknown unit is rejected');
say();

say('## 3. Lineage — demand cannot escape its task');
// A task in project B, claimed under project A's lineage.
const crossProject = await reqRefused([T, pA, sA, tB, 'pool', 'x', 'persons', 1]);
check(!!crossProject && /task_fkey/.test(crossProject),
  'a requirement naming another project\'s task is rejected BY THE COMPOSITE FK',
  crossProject?.split('\n')[0]);

const crossSchedule = await reqRefused([T, pB, sB, tA, 'pool', 'y', 'persons', 1]);
check(!!crossSchedule && /task_fkey/.test(crossSchedule),
  'a requirement whose task belongs to a different schedule is rejected', crossSchedule?.split('\n')[0]);

const crossTenant = await reqRefused([OTHER, pA, sA, tA, 'pool', 'z', 'persons', 1]);
check(!!crossTenant && /task_fkey/.test(crossTenant),
  'a requirement claiming another tenant is rejected BY THE COMPOSITE FK, not by UNIQUE',
  crossTenant?.split('\n')[0]);
say();

say('## 4. Requirements die with their task');
const before = await owner.query(
  'select count(*)::int as n from public.aura_projects_task_requirements where task_id=$1', [tA]);
await owner.query('delete from public.aura_projects_schedule_tasks where id=$1', [tA]);
const after = await owner.query(
  'select count(*)::int as n from public.aura_projects_task_requirements where task_id=$1', [tA]);
check(before.rows[0].n > 0 && after.rows[0].n === 0,
  'deleting a task cascades its demand away — no requirement outlives the work it describes',
  `${before.rows[0].n} → ${after.rows[0].n}`);
say();

say('## 5. Isolation, from aura_app (NOSUPERUSER, NOBYPASSRLS, non-owner)');
const { rows: posture } = await owner.query(`
  select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
         (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='aura_projects_task_requirements'`);
check(posture[0]?.enabled === true, 'relrowsecurity');
check(posture[0]?.forced === true, 'relforcerowsecurity');
check((posture[0]?.policies ?? 0) > 0, 'has a policy', `${posture[0]?.policies}`);

await req([T, pB, sB, tB, 'pool', 'visible', 'persons', 3]);
const app = new pg.Client({ connectionString: appUrl });
let connected = true;
try { await app.connect(); } catch (e) { connected = false; check(false, 'connect as aura_app', e.message); }
if (connected) {
  await setTenant(app, OTHER);
  const { rows: seen } = await app.query('select id from public.aura_projects_task_requirements');
  check(seen.length === 0, "another tenant cannot read this tenant's demand");
  await setTenant(app, T);
  const { rows: own } = await app.query('select id from public.aura_projects_task_requirements');
  check(own.length > 0, 'the owning tenant can — the policy is not simply denying everything',
    `${own.length} requirement(s)`);
  await app.end();
}

await cleanup();
await owner.end();
say();
say(failures === 0
  ? '**All checks passed.** Every seeded row was deleted.'
  : `**${failures} check(s) FAILED.** See above.`);
process.exit(failures === 0 ? 0 : 1);
