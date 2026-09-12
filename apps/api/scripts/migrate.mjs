// AURA OS migration runner.
// Applies infrastructure/migrations/*.sql in filename order, recording applied files
// in public.aura_migrations so it's idempotent. Each migration runs in its own
// transaction. Takes MIGRATION_DATABASE_URL, else DATABASE_URL — in that order of precedence,
// which the guard below exists to keep from surprising anyone. Run: pnpm db:migrate
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';
import { selectRollbackTargets } from './migration-rollback.mjs';
import { openCrossTenantSession } from './lib/cross-tenant-session.mjs';

const here = dirname(fileURLToPath(import.meta.url)); // apps/api/scripts
const apiRoot = join(here, '..'); // apps/api
const migrationsDir = join(apiRoot, '..', '..', 'infrastructure', 'migrations');

// Which connection variables did the CALLER actually set? This has to be captured BEFORE dotenv
// runs. dotenv does not overwrite a variable that is already present, but it does supply one that
// is absent — so afterwards a value the caller deliberately chose is indistinguishable from one
// .env.local volunteered on their behalf. The guard below is built on exactly that distinction.
const explicitlySet = new Set(
  ['MIGRATION_DATABASE_URL', 'DATABASE_URL'].filter(
    (name) => process.env[name]?.trim() || process.env[`${name}_FILE`]?.trim(),
  ),
);

config({ path: join(apiRoot, '.env.local') });

// Secret seam (`DATABASE_URL_FILE` for vault/secret mounts) — self-contained copy of
// shared readSecret so the runner works before any workspace build.
const envOrFile = (name) => {
  const file = process.env[`${name}_FILE`]?.trim();
  if (file) return readFileSync(file, 'utf8').trim() || null;
  return process.env[name]?.trim() || null;
};

// Schema work needs the owning role; the app runs as least-privilege `aura_app`, which is
// NOBYPASSRLS and cannot CREATE. Once DATABASE_URL points at aura_app (G-03), migrations must
// use their own connection — hence MIGRATION_DATABASE_URL, falling back to DATABASE_URL for
// setups that have not split the roles yet. See docs/runbooks/rls-tenant-isolation.md.
const connectionString = envOrFile('MIGRATION_DATABASE_URL') ?? envOrFile('DATABASE_URL');
if (!connectionString) {
  console.error(
    '✗ Neither MIGRATION_DATABASE_URL nor DATABASE_URL is set (env, _FILE, or apps/api/.env.local) — cannot run migrations.',
  );
  process.exit(1);
}

// ── Guard: never migrate a database the caller did not choose.
//
// Two facts above compose into a trap. This runner PREFERS MIGRATION_DATABASE_URL, and it reads
// apps/api/.env.local through dotenv, which fills in whatever the caller left absent. So
// `DATABASE_URL=<a local database> node scripts/migrate.mjs` can have .env.local quietly supply a
// MIGRATION_DATABASE_URL pointing somewhere else entirely — and that one then wins, silently, over
// the database the caller named on the command line. This is not hypothetical: it is how the Wave
// 0 provisioner came to aim the whole chain at shared remote infrastructure while reporting two
// green steps (docs/runbooks/wave-0-local-verification-environment.md).
//
// Refuse only that shape: the URL that won came from .env.local, the caller had explicitly set the
// other one, and the two name different databases. Everything legitimate passes through —
// both-from-.env.local is the normal configured case, both-explicit is the caller's own doing, and
// CI and the Docker image ship no .env.local at all, so the guard cannot fire there.
const describe = (u) => {
  try {
    const p = new URL(u);
    const h = ['127.0.0.1', '::1'].includes(p.hostname) ? 'localhost' : p.hostname;
    return `${h}:${p.port || '5432'}${p.pathname}`;
  } catch {
    return null;
  }
};
const chosenName = envOrFile('MIGRATION_DATABASE_URL') ? 'MIGRATION_DATABASE_URL' : 'DATABASE_URL';
const otherName = chosenName === 'MIGRATION_DATABASE_URL' ? 'DATABASE_URL' : 'MIGRATION_DATABASE_URL';
const otherUrl = envOrFile(otherName);
if (otherUrl && !explicitlySet.has(chosenName) && explicitlySet.has(otherName)) {
  const chosenTarget = describe(connectionString);
  const otherTarget = describe(otherUrl);
  if (chosenTarget && otherTarget && chosenTarget !== otherTarget) {
    console.error('✗ REFUSED: the two connection variables name different databases.');
    console.error(`    ${chosenName.padEnd(22)} ${chosenTarget}`);
    console.error('      ↑ came from apps/api/.env.local, and it takes precedence');
    console.error(`    ${otherName.padEnd(22)} ${otherTarget}`);
    console.error('      ↑ what you actually set');
    console.error('  Migrating the first while you asked for the second is never what you meant.');
    console.error(`  Set ${chosenName} to the database you intend, or remove it from .env.local.`);
    process.exit(1);
  }
}

// `postgresql?` read as "postgresq" + an optional "l", so it never matched the ordinary
// `postgres://` form and every run printed "unknown". The role is worth naming correctly now that
// the target is printed beside it.
const owner = /^postgres(?:ql)?:\/\/([^:]+)/.exec(connectionString)?.[1] ?? 'unknown';
// Name the TARGET, not just the role. "migrating as aura" reads identically whether it is pointed
// at a throwaway container or shared infrastructure; the host is what tells them apart. No
// credential is ever printed — describe() keeps only host, port and database name.
console.log(`→ migrating as "${decodeURIComponent(owner)}" → ${describe(connectionString) ?? 'unknown target'}`);
const sslOff =
  /(@|\/\/)(localhost|127\.0\.0\.1)/.test(connectionString) || /[?&]sslmode=disable/.test(connectionString);
const client = new pg.Client({ connectionString, ssl: sslOff ? false : { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  // A migration acts on every tenant at once and binds no tenant, so RLS — which FORCE extends
  // to the table's owner — would filter it to nothing WITHOUT RAISING. This makes that case fail
  // instead of reporting success over an empty result (TC-GATE-21).
  await openCrossTenantSession(client, 'migrate');
  await client.query(
    `create table if not exists public.aura_migrations (
       filename   text        primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const applied = new Set(
    (await client.query('select filename from public.aura_migrations')).rows.map((r) => r.filename),
  );
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  // Guard: no two migrations may share the same numeric prefix. A collision means a
  // merge introduced a duplicate number — fail fast rather than silently skip one.
  const byNumber = new Map();
  for (const f of files) {
    const n = f.match(/^(\d+)/)?.[1];
    if (!n) continue;
    if (byNumber.has(n)) {
      throw new Error(
        `duplicate migration number ${n}: "${byNumber.get(n)}" and "${f}" — renumber one before running`,
      );
    }
    byNumber.set(n, f);
  }

  // Split a migration into UP / DOWN halves on the `-- @DOWN` marker (down is optional).
  const split = (sql) => {
    const i = sql.indexOf('-- @DOWN');
    return i < 0 ? { up: sql, down: null } : { up: sql.slice(0, i), down: sql.slice(i) };
  };

  // Rollback mode:
  //   node migrate.mjs down                          revert the most recently applied migration
  //   node migrate.mjs down 0235_auth_sessions.sql   revert the tip down to AND INCLUDING that file
  if (process.argv[2] === 'down') {
    const targets = selectRollbackTargets(files, applied, process.argv[3]);
    if (targets.length === 0) { console.log('Nothing to roll back.'); return; }
    // Pre-flight EVERY @DOWN before touching the database: discovering a missing one halfway
    // through would leave the schema partly unwound, which is worse than not starting at all.
    const sections = targets.map((file) => {
      const { down } = split(readFileSync(join(migrationsDir, file), 'utf8'));
      if (!down) throw new Error(`${file} has no "-- @DOWN" section — cannot roll back`);
      return { file, down };
    });
    for (const { file, down } of sections) {
      console.log(`↩ rolling back ${file} ...`);
      await client.query('BEGIN');
      try {
        await client.query(down);
        await client.query('delete from public.aura_migrations where filename = $1', [file]);
        await client.query('COMMIT');
        console.log(`✓ rolled back ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`rollback ${file} failed: ${err.message}`);
      }
    }
    return;
  }

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`• skip  ${file} (already applied)`);
      continue;
    }
    const { up } = split(readFileSync(join(migrationsDir, file), 'utf8'));
    console.log(`→ apply ${file} ...`);
    await client.query('BEGIN');
    try {
      await client.query(up);
      await client.query('insert into public.aura_migrations (filename) values ($1)', [file]);
      await client.query('COMMIT');
      ran += 1;
      console.log(`✓ done  ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${err.message}`);
    }
  }
  console.log(`\nMigrations: ${ran} applied, ${files.length - ran} already current.`);
}

main()
  .catch((err) => {
    console.error(`\n✗ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => client.end());
