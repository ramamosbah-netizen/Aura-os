// AURA OS — Wave 0 local verification database provisioner (AURA-ENV-001).
//
// Mirrors what CI's `deploy-readiness` job does to its throwaway Postgres service, but for a
// local engine and without `psql` (which is not installed on a typical Windows dev box — this
// uses the `pg` driver the API already depends on).
//
// It is engine-agnostic: point LOCAL_DATABASE_URL at any disposable PostgreSQL 16 with the
// `vector` extension available (docker-compose.dev.yml, a native install, anything).
//
//   LOCAL_DATABASE_URL=postgres://aura:aura@localhost:55432/aura?sslmode=disable \
//     node apps/api/scripts/provision-local-db.mjs
//
// Steps, in order:
//   1. connect as the owner and refuse anything that is not obviously local
//   2. apply the full migration chain from zero          (proves the chain)
//   3. re-run it and assert nothing applies               (proves idempotency)
//   4. verify the chain landed HERE and nowhere else      (see SAFETY below)
//   5. create/activate `aura_app` with LOGIN              (the NOBYPASSRLS runtime role)
//   6. mark the database `e2e-disposable`                 (what the browser suite demands)
//   7. run the RLS fitness check + cross-tenant isolation proof
//   8. seed the e2e actors CI's TIER-3 job seeds          (so the browser suite can run here)
//
// SAFETY — and why step 4 exists.
//
// This script takes its own variable (LOCAL_DATABASE_URL) and refuses a non-local host, but that
// only binds THIS process. Every step above runs in a CHILD process, and those children read
// apps/api/.env.local through dotenv. dotenv does not overwrite a variable that is already set —
// it does fill in one that is ABSENT. So passing only DATABASE_URL to migrate.mjs left
// MIGRATION_DATABASE_URL unset in the child, dotenv supplied it from .env.local, and migrate.mjs
// prefers it (`MIGRATION_DATABASE_URL ?? DATABASE_URL`) — which aimed the entire migration chain
// at the shared remote Supabase project that this runbook exists to keep local work away from.
//
// Two fixes, because the first one is still only an assumption about plumbing:
//   * every child is handed BOTH connection variables explicitly (childEnv below), so dotenv has
//     nothing absent left to fill;
//   * step 4 then MEASURES this database and asserts the chain actually landed in it. If a future
//     variable, a `_FILE` seam or a stray shell export ever re-opens the hole, the run fails there
//     rather than reporting success over a database it never touched.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';


const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..'); // repo root, from apps/api/scripts

const url = process.env.LOCAL_DATABASE_URL?.trim();
if (!url) {
  console.error('✗ LOCAL_DATABASE_URL is not set.');
  console.error('  e.g. LOCAL_DATABASE_URL=postgres://aura:aura@localhost:55432/aura?sslmode=disable');
  process.exit(1);
}

// ── Guard 1: the host must be local. No exceptions, no override flag.
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`✗ REFUSED: LOCAL_DATABASE_URL host is "${host}".`);
  console.error('  This provisioner only ever runs against a local, disposable database.');
  process.exit(1);
}

const APP_PASSWORD = process.env.LOCAL_APP_PASSWORD?.trim() || 'aura_app_local';
// Percent-encoded here because this one goes into a URL; the SQL below does its own escaping. A
// password carrying @ : / or ? would otherwise assemble a connection string that parses as a
// different host — the same class of mistake this whole script guards against.
const appUrl = url.replace(/\/\/[^@]+@/, `//aura_app:${encodeURIComponent(APP_PASSWORD)}@`);

// Pin BOTH connection variables for every child, and blank both `_FILE` seams. The children
// resolve `<NAME>_FILE` BEFORE `<NAME>`, so leaving that absent would hand dotenv a second route
// back to .env.local's target. An empty string reads as unset by their `envOrFile` helper.
// (Windows may drop an empty value entirely rather than pass it through — harmless, because
// .env.local defines no `_FILE` variant today and step 4 measures the outcome either way.)
const childEnv = () => ({
  DATABASE_URL: url,
  MIGRATION_DATABASE_URL: url,
  DATABASE_URL_FILE: '',
  MIGRATION_DATABASE_URL_FILE: '',
});

const run = (label, cmd, args, env = {}) => {
  process.stdout.write(`\n▶ ${label}\n`);
  const r = spawnSync(cmd, args, { cwd: repo, stdio: 'inherit', env: { ...process.env, ...env }, shell: false });
  if (r.status !== 0) { console.error(`✗ ${label} failed (exit ${r.status})`); process.exit(1); }
};

const pg = (await import('pg')).default;
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
} catch (err) {
  console.error(`✗ Could not reach a PostgreSQL server at ${host}:${new URL(url).port || 5432}.`);
  console.error(`  ${err.code === 'ECONNREFUSED' ? 'Connection refused — nothing is listening there.' : err.message}`);
  console.error('  Start one first, e.g.  docker compose -f docker-compose.dev.yml up -d');
  process.exit(1);
}

// ── Guard 2: refuse a database that already holds real-looking data.
const { rows: [{ count }] } = await client.query(
  `select count(*)::int as count from information_schema.tables where table_schema='public' and table_name like 'aura_%'`,
);
if (count > 0) {
  const { rows: [marker] } = await client.query(
    `select marker from public.aura_environment limit 1`,
  ).catch(() => ({ rows: [undefined] }));
  if (marker?.marker !== 'e2e-disposable') {
    console.error(`✗ REFUSED: this database already has ${count} aura_* tables and is not marked 'e2e-disposable'.`);
    console.error('  Provision a fresh one — that is what "disposable" means.');
    await client.end();
    process.exit(1);
  }
  console.log(`  (re-provisioning an already-disposable database with ${count} aura_* tables)`);
}

console.log(`✓ target is local and disposable: ${host}`);
await client.end();

// ── 2 + 3. Migration chain from zero, then prove idempotency.
run('migrations — full chain from zero', process.execPath, [join(repo, 'apps/api/scripts/migrate.mjs')], childEnv());

process.stdout.write('\n▶ migrations — idempotent re-run\n');
const rerun = spawnSync(process.execPath, [join(repo, 'apps/api/scripts/migrate.mjs')], {
  cwd: repo, encoding: 'utf8', env: { ...process.env, ...childEnv() },
});
process.stdout.write(rerun.stdout ?? '');
if (rerun.status !== 0 || !/0 applied/.test(rerun.stdout ?? '')) {
  console.error('✗ re-run applied migrations — the chain is not idempotent.');
  process.exit(1);
}
console.log('✓ chain is idempotent');

// ── 4. Prove the chain landed in THIS database rather than one .env.local named.
// "0 applied" above only says that SOME database is current, and a shared project that is already
// at head answers exactly that — which is how a run could report two green steps having never
// touched the local engine at all. So count the ledger over this script's OWN connection, the one
// guard 1 checked, and compare it against the files on disk.
const onDisk = readdirSync(join(repo, 'infrastructure', 'migrations')).filter((f) => f.endsWith('.sql')).length;
const verify = new pg.Client({ connectionString: url });
await verify.connect();
const { rows: [ledger] } = await verify
  .query('select count(*)::int as applied from public.aura_migrations')
  .catch(() => ({ rows: [{ applied: 0 }] }));
await verify.end();
if (ledger.applied !== onDisk) {
  console.error(`✗ REFUSED: ${host} holds ${ledger.applied} applied migrations but ${onDisk} exist on disk.`);
  console.error('  The migration runner did not target this database, so nothing above is proven.');
  console.error('  Check for a DATABASE_URL, MIGRATION_DATABASE_URL or *_FILE override reaching the');
  console.error('  child process from your shell or from apps/api/.env.local.');
  process.exit(1);
}
console.log(`✓ chain landed here — ${ledger.applied}/${onDisk} migrations applied to ${host}`);

// ── 5 + 6. Activate aura_app, mark the database disposable.
const owner = new pg.Client({ connectionString: url });
await owner.connect();
// 0163 creates aura_app NOLOGIN and ships no credential, so activation is the operator's step.
// Check first: a missing role means the chain did not really run here, and that is worth saying
// plainly instead of surfacing as a bare "role does not exist" from inside the ALTER.
const { rows: [appRole] } = await owner.query(`select 1 from pg_roles where rolname='aura_app'`);
if (!appRole) {
  console.error('✗ role aura_app does not exist — migration 0163 has not been applied to this database.');
  await owner.end();
  process.exit(1);
}
await owner.query(`ALTER ROLE aura_app LOGIN PASSWORD '${APP_PASSWORD.replace(/'/g, "''")}'`);
await owner.query(`
  CREATE TABLE IF NOT EXISTS public.aura_environment (marker text PRIMARY KEY);
  INSERT INTO public.aura_environment (marker) VALUES ('e2e-disposable') ON CONFLICT DO NOTHING;
  GRANT SELECT ON public.aura_environment TO aura_app;
`);
const { rows: [role] } = await owner.query(
  `select rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname='aura_app'`,
);
await owner.end();
console.log(`\n✓ aura_app activated — LOGIN=${role.rolcanlogin} SUPERUSER=${role.rolsuper} BYPASSRLS=${role.rolbypassrls}`);
if (role.rolsuper || role.rolbypassrls) {
  console.error('✗ aura_app must be NOSUPERUSER and NOBYPASSRLS or RLS proves nothing.');
  process.exit(1);
}
console.log('✓ database marked e2e-disposable');

// ── 7. Prove isolation live. This is what removes audit limitation L-2.
run('RLS fitness — every tenant-scoped table protected', process.execPath, [join(repo, 'apps/api/scripts/rls-fitness.mjs')], childEnv());
run('RLS isolation — cross-tenant denied under a non-bypass role', process.execPath, [join(repo, 'apps/api/scripts/rls-isolation-test.mjs')], childEnv());

// ── 8. Seed the actors the browser suite needs — the same two roles and three grants CI's TIER-3
// job creates ("Grant the actors the suite needs" in .github/workflows/ci.yml). Without them the
// segregation-of-duties, DM-privacy and restricted-viewer specs fail locally for setup reasons
// that read exactly like product bugs, and Wave 0's step 4 cannot clear limitation L-1.
//
// u-admin is deliberately NOT seeded: it takes its wildcard from the boot seeder, which persists
// grants when a database is configured. The other two must not have one, or the specs that depend
// on them passing for the right reason stop proving anything.
process.stdout.write('\n▶ e2e actors — roles and grants the browser suite depends on\n');
const actors = new pg.Client({ connectionString: url });
await actors.connect();
await actors.query(`
  INSERT INTO public.aura_access_roles (id, name, permissions, updated_at) VALUES
    ('e2e-chat-reader', 'E2E chat reader', '["comms.channel.read"]'::jsonb, now()),
    ('e2e-viewer',      'E2E viewer',      '["workspace.me.read"]'::jsonb,  now())
  ON CONFLICT (id) DO UPDATE SET permissions = excluded.permissions, updated_at = now();
`);
await actors.query(`
  INSERT INTO public.aura_access_grants (user_id, role_id, scope_key, scope, updated_at) VALUES
    ('u-e2e-checker', 'hse',             'org:tenant:dev-tenant', '{"kind":"org","level":"tenant","id":"dev-tenant"}'::jsonb, now()),
    ('u-e2e-checker', 'e2e-chat-reader', 'org:tenant:dev-tenant', '{"kind":"org","level":"tenant","id":"dev-tenant"}'::jsonb, now()),
    ('u-e2e-viewer',  'e2e-viewer',      'org:tenant:dev-tenant', '{"kind":"org","level":"tenant","id":"dev-tenant"}'::jsonb, now())
  ON CONFLICT (user_id, role_id, scope_key) DO NOTHING;
`);
await actors.end();
console.log('✓ seeded u-e2e-checker (hse + e2e-chat-reader) and u-e2e-viewer (e2e-viewer)');

console.log(`
────────────────────────────────────────────────────────────────
✓ Wave 0 local verification database is ready.

  owner  ${url}
  app    ${appUrl.replace(/:[^:@]+@/, ':***@')}

Point apps/api/.env.local at it:

  DATABASE_URL=${appUrl}
  MIGRATION_DATABASE_URL=${url}
  AUTO_MIGRATE=off

The seeded actors also need to be able to sign in, or the specs that use them 401 before they
reach anything they were written to prove:

  AUTH_DEV_ADMIN_USER=u-admin,u-e2e-checker,u-e2e-viewer

Then restart the API. Health should report environment "e2e-disposable",
which is what lets the browser suite run against it.
────────────────────────────────────────────────────────────────`);
