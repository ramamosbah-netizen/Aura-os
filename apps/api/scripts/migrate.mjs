// AURA OS migration runner.
// Applies infrastructure/migrations/*.sql in filename order, recording applied files
// in public.aura_migrations so it's idempotent. Each migration runs in its own
// transaction. Requires DATABASE_URL (apps/api/.env.local). Run: pnpm db:migrate
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';
import { selectRollbackTargets } from './migration-rollback.mjs';

const here = dirname(fileURLToPath(import.meta.url)); // apps/api/scripts
const apiRoot = join(here, '..'); // apps/api
const migrationsDir = join(apiRoot, '..', '..', 'infrastructure', 'migrations');

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
const owner = /^postgresql?:\/\/([^:]+)/.exec(connectionString)?.[1] ?? 'unknown';
console.log(`→ migrating as "${decodeURIComponent(owner)}"`);
const sslOff =
  /(@|\/\/)(localhost|127\.0\.0\.1)/.test(connectionString) || /[?&]sslmode=disable/.test(connectionString);
const client = new pg.Client({ connectionString, ssl: sslOff ? false : { rejectUnauthorized: false } });

async function main() {
  await client.connect();
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
