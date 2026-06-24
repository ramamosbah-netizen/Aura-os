// AURA OS migration runner.
// Applies infrastructure/migrations/*.sql in filename order, recording applied files
// in public.aura_migrations so it's idempotent. Each migration runs in its own
// transaction. Requires DATABASE_URL (apps/api/.env.local). Run: pnpm db:migrate
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url)); // apps/api/scripts
const apiRoot = join(here, '..'); // apps/api
const migrationsDir = join(apiRoot, '..', '..', 'infrastructure', 'migrations');

config({ path: join(apiRoot, '.env.local') });

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error('✗ DATABASE_URL is not set in apps/api/.env.local — cannot run migrations.');
  process.exit(1);
}
const isLocal = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(connectionString);
const client = new pg.Client({ connectionString, ssl: isLocal ? false : { rejectUnauthorized: false } });

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

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`• skip  ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`→ apply ${file} ...`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
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
