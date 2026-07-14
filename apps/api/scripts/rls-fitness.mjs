// AURA OS — RLS fitness check (Roadmap R1 / G-P0-1).
// Fails (exit 1) if ANY tenant-scoped `public.aura_*` business table is missing database-
// enforced tenant isolation: RLS not enabled, RLS not FORCED, or no policy present. This is
// the permanent regression guard — a new tenant table shipped without protection breaks CI.
// Runs against DATABASE_URL (CI's Postgres service after migrations, or a local .env.local).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(apiRoot, '.env.local') });

const envOrFile = (name) => {
  const file = process.env[`${name}_FILE`]?.trim();
  if (file) return readFileSync(file, 'utf8').trim() || null;
  return process.env[name]?.trim() || null;
};
const connectionString = envOrFile('DATABASE_URL');
if (!connectionString) {
  console.error('✗ DATABASE_URL not set — cannot run RLS fitness check.');
  process.exit(1);
}

// Kept in lock-step with infrastructure/migrations/0163 (system / pre-tenant tables).
const EXCLUDED = new Set([
  'aura_events', 'aura_users', 'aura_service_accounts',
  'aura_webhook_subscriptions', 'aura_vector_store',
]);

const sslOff = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(connectionString) || /[?&]sslmode=disable/.test(connectionString);
const client = new pg.Client({ connectionString, ssl: sslOff ? false : { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  const { rows } = await client.query(`
    SELECT c.relname AS table,
           c.relrowsecurity  AS rls_enabled,
           c.relforcerowsecurity AS rls_forced,
           (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'aura_%'
      AND EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema='public' AND col.table_name=c.relname AND col.column_name='tenant_id')
    ORDER BY c.relname`);

  const scoped = rows.filter((r) => !EXCLUDED.has(r.table));
  const violations = scoped.filter((r) => !r.rls_enabled || !r.rls_forced || Number(r.policies) === 0);

  const forced = scoped.filter((r) => r.rls_forced).length;
  console.log(`RLS fitness: ${scoped.length} tenant-scoped tables · enabled ${scoped.filter((r) => r.rls_enabled).length} · forced ${forced} · with-policy ${scoped.filter((r) => Number(r.policies) > 0).length} · excluded ${rows.length - scoped.length}`);

  if (violations.length > 0) {
    console.error(`\n✗ ${violations.length} table(s) lack enforced tenant isolation:`);
    for (const v of violations) {
      const why = [!v.rls_enabled && 'RLS disabled', !v.rls_forced && 'not FORCED', Number(v.policies) === 0 && 'no policy'].filter(Boolean).join(', ');
      console.error(`  - ${v.table}: ${why}`);
    }
    console.error('\nAdd the table to migration 0163 coverage, or (if genuinely system/pre-tenant) to the EXCLUDED set with justification.');
    await client.end();
    process.exit(1);
  }
  console.log('✓ every tenant-scoped business table has RLS enabled + FORCED + a policy.');
  await client.end();
}
main().catch((e) => { console.error('✗ RLS fitness error:', e.message); process.exit(1); });
