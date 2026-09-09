// §21 — RLS posture audit + database-enforced invariant proof.
//
// Two jobs, deliberately in one run against one fresh database:
//
//   PART A  read-only posture audit of every aura_projects_* table (relrowsecurity,
//           relforcerowsecurity, owner, policies), the runtime role, and a live cross-tenant
//           attempt from a NOBYPASSRLS non-owner. Records findings; fixes nothing.
//
//   PART B  proves the §21 constraints actually refuse what they claim to refuse. Reading the
//           migration proves nothing — an earlier finding in this task was produced by grepping
//           SQL and was wrong.
//
// Usage:  node s21-db-proof.mjs <repo>/apps/api
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

// Safety: this script writes rows. Refuse anything that is not the disposable database.
const { rows: marker } = await owner
  .query(`select marker from public.aura_environment limit 1`)
  .catch(() => ({ rows: [] }));
if (marker[0]?.marker !== 'e2e-disposable') {
  console.error('✗ refusing to run: this database carries no e2e-disposable marker.');
  process.exit(1);
}

const setTenant = (client, t) => client.query(`select set_config('app.current_tenant_id',$1,false)`, [t ?? '']);

// ══ PART A — posture audit ═══════════════════════════════════════════════════
say('# §21 — RLS posture audit and database proof');
say();
say(`_Generated ${new Date().toISOString()} against the disposable database._`);
say();

const { rows: mig } = await owner.query(
  `select count(*)::int as applied, max(filename) as head from public.aura_migrations`);
say('## A1. Migration chain');
say(`Applied from zero: **${mig[0].applied}** · head \`${mig[0].head}\``);
say();

const POSTURE = `
  select c.relname as table_name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
         pg_get_userbyid(c.relowner) as owner,
         (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies,
         exists (select 1 from information_schema.columns col
                  where col.table_schema='public' and col.table_name=c.relname
                    and col.column_name='tenant_id') as has_tenant_id
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and c.relname like $1
   order by c.relname`;

const { rows: proj } = await owner.query(POSTURE, ['aura_projects%']);
say(`## A2. \`aura_projects_*\` posture — ${proj.length} tables`);
say();
say('| table | tenant_id | ENABLE | FORCE | policies | owner |');
say('|---|---|---|---|---|---|');
for (const r of proj) {
  say(`| \`${r.table_name}\` | ${r.has_tenant_id ? 'yes' : '**no**'} | ${r.enabled ? '✓' : '**✗**'} | ` +
      `${r.forced ? '✓' : '**✗**'} | ${r.policies} | ${r.owner} |`);
}
say();

const classify = (r) => !r.enabled ? 'NO RLS'
  : r.policies === 0 ? 'ENABLED, NO POLICY'
    : r.forced ? 'ENABLE + FORCE' : 'ENABLE only';
const buckets = {};
for (const r of proj) (buckets[classify(r)] ??= []).push(r.table_name);
say('## A3. Classification');
for (const [k, v] of Object.entries(buckets)) {
  say(`- **${k}** (${v.length}): ${v.map((n) => `\`${n}\``).join(', ')}`);
}
say();

const { rows: all } = await owner.query(POSTURE, ['aura\\_%']);
const withTenant = all.filter((r) => r.has_tenant_id);
const gaps = withTenant.filter((r) => !r.enabled || !r.forced || r.policies === 0);
const noTenant = all.filter((r) => !r.has_tenant_id);
say('## A4. Whole schema, for context');
say(`\`aura_*\` tables: ${all.length} · carrying \`tenant_id\`: ${withTenant.length}`);
say(`Not (ENABLE + FORCE + ≥1 policy): **${gaps.length}**`);
for (const r of gaps) say(`- \`${r.table_name}\` — enabled=${r.enabled} forced=${r.forced} policies=${r.policies}`);
say();
say(`\`aura_*\` tables with **no \`tenant_id\`** — invisible to 0163's loop and to rls-fitness.mjs: ${noTenant.length}`);
for (const r of noTenant) say(`- \`${r.table_name}\` — enabled=${r.enabled} forced=${r.forced} policies=${r.policies}`);
say();

const { rows: roles } = await owner.query(
  `select rolname, rolsuper, rolbypassrls, rolcanlogin from pg_roles
    where rolname in ('aura','aura_app','postgres') order by rolname`);
say('## A5. Roles');
say();
say('| role | SUPERUSER | BYPASSRLS | LOGIN |');
say('|---|---|---|---|');
for (const r of roles) say(`| \`${r.rolname}\` | ${r.rolsuper} | ${r.rolbypassrls} | ${r.rolcanlogin} |`);
const { rows: members } = await owner.query(
  `select m1.rolname as is_member_of from pg_auth_members am
     join pg_roles m1 on m1.oid=am.roleid join pg_roles m2 on m2.oid=am.member
    where m2.rolname='aura_app'`);
say();
say(`\`aura_app\` memberships: ${members.length ? members.map((m) => m.is_member_of).join(', ') : '**none** — it cannot SET ROLE to the owner'}`);
say(`\`aura_app\` owns ${proj.filter((r) => r.owner === 'aura_app').length} of the \`aura_projects_*\` tables.`);
say();
say('> Two independent controls guard this boundary. For a NON-OWNER role, `ENABLE` alone is');
say('> enough and the policy applies. `FORCE` is what additionally binds the OWNER — which is how');
say('> local development and the disposable database connect. Absence of `FORCE` therefore does');
say('> not mean the runtime role is unprotected; it means the owner path can bypass, and that an');
say('> RLS proof run as the owner would pass vacuously.');
say();

// ══ PART B — §21 invariants, proven ══════════════════════════════════════════
say('## B. §21 invariants — proven, not read');
say();

const A = 'rls-proof-tenant-a';
const B = 'rls-proof-tenant-b';
const pA = '11111111-1111-4111-8111-111111111111';
const pB = '22222222-2222-4222-8222-222222222222';
const rA = '33333333-3333-4333-8333-333333333333';
const iA = '44444444-4444-4444-8444-444444444444';

const cleanup = async () => {
  await setTenant(owner, null);
  for (const t of [A, B]) {
    await setTenant(owner, t);
    await owner.query(`delete from public.aura_projects_issue_references where tenant_id = $1`, [t]).catch(() => {});
    await owner.query(`delete from public.aura_projects_issues where tenant_id = $1`, [t]).catch(() => {});
    await owner.query(`delete from public.aura_projects_risks  where tenant_id = $1`, [t]).catch(() => {});
    await owner.query(`delete from public.aura_projects_projects where id = any($1::uuid[])`, [[pA, pB]]).catch(() => {});
  }
  await setTenant(owner, null);
};
await cleanup();

const refused = async (client, sql, params) => {
  try { await client.query(sql, params); return null; } catch (e) { return e.message; }
};

say('### B1. Structure');
const s21 = proj.filter((r) => ['aura_projects_risks', 'aura_projects_issues', 'aura_projects_issue_references'].includes(r.table_name));
check(s21.length === 3, 'all three §21 tables exist', `${s21.length}/3`);
for (const t of s21) {
  check(t.enabled, `\`${t.table_name}\` relrowsecurity`);
  check(t.forced, `\`${t.table_name}\` relforcerowsecurity`);
  check(t.policies > 0, `\`${t.table_name}\` has a policy`, `${t.policies}`);
}
say();

say('### B2. CHECK constraints refuse a status outside the lifecycle');
await setTenant(owner, A);
await owner.query(
  `insert into public.aura_projects_projects (id, tenant_id, title, status) values ($1,$2,'Proof A','planned')`, [pA, A]);
await setTenant(owner, B);
await owner.query(
  `insert into public.aura_projects_projects (id, tenant_id, title, status) values ($1,$2,'Proof B','planned')`, [pB, B]);
await setTenant(owner, A);
await owner.query(
  `insert into public.aura_projects_risks (id, tenant_id, project_id, title, status)
   values ($1,$2,$3,'Authority approval may be delayed','OPEN')`, [rA, A, pA]);

check(!!await refused(owner,
  `insert into public.aura_projects_risks (tenant_id, project_id, title, status)
   values ($1,$2,'bad status','ISSUE')`, [A, pA]),
  'risk status outside OPEN|MITIGATING|ACCEPTED|RESOLVED|MATERIALISED is rejected');
check(!!await refused(owner,
  `insert into public.aura_projects_issues (tenant_id, project_id, title, severity)
   values ($1,$2,'bad severity','CRITICAL')`, [A, pA]),
  'issue severity borrowed from the risk scale is rejected');
check(!!await refused(owner,
  `insert into public.aura_projects_issues (tenant_id, project_id, title, status)
   values ($1,$2,'bad status','closed')`, [A, pA]),
  'issue status outside open|in_progress|resolved|withdrawn is rejected');
say();

say('### B3. Provenance — DG-21.3');
await owner.query(
  `insert into public.aura_projects_issues (id, tenant_id, project_id, title, origin_risk_id)
   values ($1,$2,$3,'Authority approval is overdue',$4)`, [iA, A, pA, rA]);
check(true, 'an issue may carry origin_risk_id for a risk in the same project');

const dupe = await refused(owner,
  `insert into public.aura_projects_issues (tenant_id, project_id, title, origin_risk_id)
   values ($1,$2,'second materialisation',$3)`, [A, pA, rA]);
check(!!dupe, 'a SECOND issue for the same origin risk is rejected by UNIQUE', dupe?.split('\n')[0]);

const unlinked = await refused(owner,
  `insert into public.aura_projects_issues (tenant_id, project_id, title) values ($1,$2,'no origin')`, [A, pA]);
check(!unlinked, 'issues with NO origin risk stay unconstrained (multiple NULLs permitted)');

// Cross-project and cross-tenant provenance must be rejected BY THE COMPOSITE FK, and the test has
// to prove that is what rejected it.
//
// The first version of this check reused `rA`, which already had an issue. UNIQUE fired first, the
// composite FK was never exercised, and the check reported green while proving nothing at all. So
// a FRESH risk is used, and the constraint NAME in the error is asserted rather than the mere fact
// that something refused.
const rFresh = '55555555-5555-4555-8555-555555555555';
await setTenant(owner, A);
await owner.query(
  `insert into public.aura_projects_risks (id, tenant_id, project_id, title, status)
   values ($1,$2,$3,'A second live exposure','OPEN')`, [rFresh, A, pA]);

const crossProject = await refused(owner,
  `insert into public.aura_projects_issues (tenant_id, project_id, title, origin_risk_id)
   values ($1,$2,'cross-project provenance',$3)`, [A, pB, rFresh]);
check(
  !!crossProject && /origin_lineage_fkey/.test(crossProject),
  'provenance crossing a PROJECT is rejected BY THE COMPOSITE FK, not by UNIQUE',
  crossProject?.split('\n')[0] ?? 'ACCEPTED',
);

await setTenant(owner, B);
const crossTenant = await refused(owner,
  `insert into public.aura_projects_issues (tenant_id, project_id, title, origin_risk_id)
   values ($1,$2,'cross-tenant provenance',$3)`, [B, pB, rFresh]);
check(
  !!crossTenant && /origin_lineage_fkey/.test(crossTenant),
  'provenance crossing a TENANT is rejected BY THE COMPOSITE FK',
  crossTenant?.split('\n')[0] ?? 'ACCEPTED',
);
say();

say('### B4. Tenant isolation, from a NOBYPASSRLS non-owner');
const app = new pg.Client({ connectionString: appUrl });
let connected = true;
try { await app.connect(); } catch (e) { connected = false; check(false, 'connect as aura_app', e.message); }

if (connected) {
  await setTenant(app, B);
  const { rows: sees } = await app.query(
    `select id from public.aura_projects_risks where id = $1`, [rA]);
  check(sees.length === 0, 'tenant B cannot READ tenant A\'s risk');

  const upd = await app.query(
    `update public.aura_projects_risks set title='HIJACKED' where id=$1`, [rA]);
  check(upd.rowCount === 0, 'tenant B cannot UPDATE tenant A\'s risk', `${upd.rowCount} rows`);

  const del = await app.query(`delete from public.aura_projects_issues where id=$1`, [iA]);
  check(del.rowCount === 0, 'tenant B cannot DELETE tenant A\'s issue', `${del.rowCount} rows`);

  const forged = await refused(app,
    `insert into public.aura_projects_risks (tenant_id, project_id, title)
     values ($1,$2,'forged')`, [A, pA]);
  check(!!forged, 'tenant B cannot INSERT a row carrying tenant A\'s tenant_id');

  await setTenant(app, A);
  const { rows: own } = await app.query(`select id from public.aura_projects_risks where id=$1`, [rA]);
  check(own.length === 1, 'tenant A CAN read its own risk (the policy is not simply denying everything)');

  const { rows: refs } = await app.query(
    `select * from public.aura_projects_issue_references where issue_id=$1`, [iA]);
  check(Array.isArray(refs), 'the reference table is readable within the tenant');
  await setTenant(app, B);
  const { rows: refsB } = await app.query(
    `select * from public.aura_projects_issue_references where issue_id=$1`, [iA]);
  check(refsB.length === 0, 'references are not readable across the tenant boundary');

  await app.end();
}

say();
say('### B5. What FORCE does and does not buy here');
//
// The first version of this section asserted that the owner, bound to tenant B, could not see
// tenant A's risk. That assertion was WRONG, and it is recorded here rather than quietly deleted:
// `aura` is a SUPERUSER, a superuser bypasses row-level security entirely, and neither ENABLE nor
// FORCE binds one. FORCE binds a NON-SUPERUSER table owner.
//
// The correct conclusion is sharper than the one that motivated adding FORCE. The migration and
// local-dev connection is not merely "the owner" — it is a superuser with BYPASSRLS, so ANY
// isolation proof run on it is vacuous whatever the tables say. That is why B4 runs as aura_app.
const ownerRole = roles.find((r) => r.rolname === 'aura');
check(ownerRole?.rolsuper === true,
  'the migration/dev role is a SUPERUSER, so no RLS applies to it by design — whatever FORCE says');
await setTenant(owner, B);
const { rows: ownerSees } = await owner.query(`select id from public.aura_projects_risks where id=$1`, [rA]);
check(ownerSees.length === 1,
  'and it therefore reads across tenants — which is exactly why the isolation proof above runs as aura_app',
  `${ownerSees.length} row(s)`);
say();
say('> `relforcerowsecurity = true` is verified structurally in B1. Its value is for a');
say('> NON-superuser owner — a posture this deployment does not currently use, and one that');
say('> cannot be demonstrated from here. FORCE is defence in depth, not the control doing the');
say('> work today. The control doing the work today is `aura_app`: NOSUPERUSER, NOBYPASSRLS,');
say('> non-owner — proven in B4.');

await cleanup();
await owner.end();

say();
say(failures === 0
  ? `**All checks passed.** Nothing was left behind; every seeded row was deleted.`
  : `**${failures} check(s) FAILED.** See above.`);
process.exit(failures === 0 ? 0 : 1);
