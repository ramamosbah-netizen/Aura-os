// §22 Step 4 — resource pools and capacity: database proof.
//
// The claim worth proving is the authority one. These tables are NOT project-scoped, so their
// isolation is tenant-level rather than a project join — and a tenant-level policy is easy to get
// subtly wrong in the permissive direction. This attacks it from a NOBYPASSRLS non-owner.
//
// Usage:  node s22-resource-pool-proof.mjs <repo>/apps/api
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

const A = 's22d-tenant-a';
const B = 's22d-tenant-b';
const cleanup = async () => {
  for (const t of [A, B]) {
    await setTenant(owner, t);
    await owner.query('delete from public.aura_projects_resource_capacity where tenant_id=$1', [t]).catch(() => {});
    await owner.query('delete from public.aura_projects_resource_pools where tenant_id=$1', [t]).catch(() => {});
  }
  await setTenant(owner, null);
};
await cleanup();

say('# §22 Step 4 — resource pool and capacity proof');
say();
say(`_Generated ${new Date().toISOString()} against the disposable database._`);
say();
const { rows: mig } = await owner.query(
  'select count(*)::int as applied, max(filename) as head from public.aura_migrations');
say('## Migration chain');
say(`Applied from zero: **${mig[0].applied}** · head \`${mig[0].head}\``);
say();

// ── 1. Authority: no project_id ───────────────────────────────────────────
say('## 1. Authority — organisation-scoped, not project-owned');
const { rows: cols } = await owner.query(`
  select table_name, column_name from information_schema.columns
   where table_schema='public'
     and table_name in ('aura_projects_resource_pools','aura_projects_resource_capacity')
     and column_name = 'project_id'`);
check(cols.length === 0,
  'neither table carries a project_id — Design Gate §3.1, and the reason cross-project detection can work at all',
  cols.map((c) => c.table_name).join(', ') || 'none');
say();

// ── 2. Pool constraints ───────────────────────────────────────────────────
say('## 2. Pool constraints');
await setTenant(owner, A);
const mk = (name, extra = '') => owner.query(
  `insert into public.aura_projects_resource_pools (tenant_id, name, unit${extra ? ', source_type, source_id' : ''})
   values ($1,$2,'persons'${extra})`, [A, name]);

await mk('Electricians');
check(true, 'an internal pool is created');

const dupe = await refused(owner,
  `insert into public.aura_projects_resource_pools (tenant_id, name, unit) values ($1,'Electricians','persons')`, [A]);
check(!!dupe && /uq_aura_projects_resource_pools_name/.test(dupe),
  'a second pool of the same name in the same scope is rejected — two would be counted independently',
  dupe?.split('\n')[0]);

const badUnit = await refused(owner,
  `insert into public.aura_projects_resource_pools (tenant_id, name, unit) values ($1,'Bad','people')`, [A]);
check(!!badUnit && /unit_check/.test(badUnit), 'an unknown unit is rejected');

const orphanCrew = await refused(owner,
  `insert into public.aura_projects_resource_pools (tenant_id, name, unit, source_type, source_id)
   values ($1,'Orphan crew','persons','subcontractor',null)`, [A]);
check(!!orphanCrew && /subcontract_check/.test(orphanCrew),
  'a subcontracted crew with no supplier behind it is rejected', orphanCrew?.split('\n')[0]);

// One supplier, several crews — the shape the gate insisted on.
await owner.query(
  `insert into public.aura_projects_resource_pools (tenant_id, name, unit, source_type, source_id) values
     ($1,'ELV Crew A','persons','subcontractor','11111111-1111-4111-8111-111111111111'),
     ($1,'ELV Crew B','persons','subcontractor','11111111-1111-4111-8111-111111111111')`, [A]);
const { rows: crews } = await owner.query(
  `select id from public.aura_projects_resource_pools where source_id='11111111-1111-4111-8111-111111111111'`);
check(crews.length === 2 && crews[0].id !== crews[1].id,
  'one supplier may field several crews, each with its own identity — supplierId is never poolId');

// A pool of the same name in a DIFFERENT org scope is a different pool.
const scoped = await refused(owner,
  `insert into public.aura_projects_resource_pools (tenant_id, name, unit, org_node_id)
   values ($1,'Electricians','persons','org-abu-dhabi')`, [A]);
check(!scoped, 'the same name in a different org scope is a different pool', scoped ?? '');
say();

// ── 3. Capacity constraints ───────────────────────────────────────────────
say('## 3. Capacity');
const cap = (q, from = '2026-07-01', to = '2026-07-31', unit = 'units') => owner.query(
  `insert into public.aura_projects_resource_capacity
     (tenant_id, resource_type, canonical_resource_id, unit, quantity, valid_from, valid_to)
   values ($1,'asset','CR-01',$2,$3,$4,$5)`, [A, unit, q, from, to]);

await cap(null);
const { rows: unknownRow } = await owner.query(
  `select quantity from public.aura_projects_resource_capacity where tenant_id=$1 and quantity is null`, [A]);
check(unknownRow.length === 1,
  'an UNKNOWN capacity is storable as NULL — not 0, and not a sentinel for unlimited');

await cap(0, '2026-08-01', '2026-08-31');
const { rows: zeroRow } = await owner.query(
  `select quantity from public.aura_projects_resource_capacity where tenant_id=$1 and quantity = 0`, [A]);
check(zeroRow.length === 1, 'a declared ZERO is a different, storable fact');

const negative = await refused(owner, `insert into public.aura_projects_resource_capacity
  (tenant_id, resource_type, canonical_resource_id, unit, quantity, valid_from, valid_to)
  values ($1,'asset','CR-01','units',-1,'2026-09-01','2026-09-02')`, [A]);
check(!!negative && /quantity_check/.test(negative), 'a negative capacity is rejected');

const backwards = await refused(owner, `insert into public.aura_projects_resource_capacity
  (tenant_id, resource_type, canonical_resource_id, unit, quantity, valid_from, valid_to)
  values ($1,'asset','CR-01','units',1,'2026-09-30','2026-09-01')`, [A]);
check(!!backwards && /interval_check/.test(backwards), 'a backwards interval is rejected');

const badType = await refused(owner, `insert into public.aura_projects_resource_capacity
  (tenant_id, resource_type, canonical_resource_id, unit, quantity, valid_from, valid_to)
  values ($1,'crane','CR-01','units',1,'2026-09-01','2026-09-02')`, [A]);
check(!!badType && /type_check/.test(badType),
  'an unknown resource type is rejected — a reference is typed, never a free string');

const overlap = await refused(owner, `insert into public.aura_projects_resource_capacity
  (tenant_id, resource_type, canonical_resource_id, unit, quantity, valid_from, valid_to)
  values ($1,'asset','CR-01','units',1,'2026-07-10','2026-07-20')`, [A]);
check(!overlap,
  'overlapping windows are ALLOWED — two hire periods genuinely give two cranes, and the domain sums them',
  overlap ?? '');
say();

// ── 4. Isolation from a non-owner ─────────────────────────────────────────
say('## 4. Isolation, from aura_app (NOSUPERUSER, NOBYPASSRLS, non-owner)');
const { rows: posture } = await owner.query(`
  select c.relname, c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
         (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname in
     ('aura_projects_resource_pools','aura_projects_resource_capacity')
   order by c.relname`);
for (const r of posture) {
  check(r.enabled && r.forced && r.policies > 0,
    `${r.relname}: ENABLE + FORCE + policy`, `policies=${r.policies}`);
}

const app = new pg.Client({ connectionString: appUrl });
let connected = true;
try { await app.connect(); } catch (e) { connected = false; check(false, 'connect as aura_app', e.message); }
if (connected) {
  await setTenant(app, B);
  const { rows: seenPools } = await app.query('select id from public.aura_projects_resource_pools');
  check(seenPools.length === 0, "tenant B cannot read tenant A's pools");
  const { rows: seenCap } = await app.query('select id from public.aura_projects_resource_capacity');
  check(seenCap.length === 0, "tenant B cannot read tenant A's capacity");

  const upd = await app.query(`update public.aura_projects_resource_pools set name='HIJACKED'`);
  check(upd.rowCount === 0, 'tenant B cannot update them', `${upd.rowCount} rows`);

  // A tenant-level policy without WITH CHECK would accept this. It has one.
  const forged = await refused(app,
    `insert into public.aura_projects_resource_pools (tenant_id, name, unit) values ($1,'forged','persons')`, [A]);
  check(!!forged, "tenant B cannot INSERT a pool carrying tenant A's tenant_id");

  await setTenant(app, A);
  const { rows: own } = await app.query('select id from public.aura_projects_resource_pools');
  check(own.length > 0, 'tenant A can read its own pools — the policy is not simply denying everything',
    `${own.length} pool(s)`);
  await app.end();
}

await cleanup();
await owner.end();
say();
say(failures === 0
  ? '**All checks passed.** Every seeded row was deleted.'
  : `**${failures} check(s) FAILED.** See above.`);
process.exit(failures === 0 ? 0 : 1);
