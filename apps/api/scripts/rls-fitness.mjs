// AURA OS — RLS fitness check (Roadmap R1 / G-P0-1).
// Fails (exit 1) if ANY tenant-scoped application table is missing database-enforced tenant
// isolation: RLS not enabled, RLS not FORCED, or no policy present. This is the permanent
// regression guard — a new tenant table shipped without protection breaks CI.
// Runs against DATABASE_URL (CI's Postgres service after migrations, or a local .env.local).
//
// DISCOVERY IS SCHEMA-DRIVEN, NOT NAME-DRIVEN.
//
// This check used to select `relname LIKE 'aura_%'`. That made the guarantee depend on a
// naming convention rather than on the property being guarded, so any table that carried a
// `tenant_id` under a different name was invisible to BOTH checks below — silently exempt
// from the tenant-isolation requirement AND from the deny-all trap detector.
//
// The S1 auth rebuild hit this immediately: `auth_credentials` holds password hashes and is
// tenant-scoped, and the gate could not see it. The S2 session tables (`auth_sessions`,
// `auth_refresh_tokens`, `auth_challenges`) would have inherited exactly the same blind spot,
// in the most security-sensitive tables in the platform.
//
// The invariant is a property of the schema: **an application table with a `tenant_id` column
// must have RLS enabled, FORCED, and at least one policy.** Discovery now matches that
// sentence directly, with a small, individually justified allowlist for genuine exceptions.
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
// Reads pg_catalog to assert every table's RLS posture — needs the owner, since aura_app
// is precisely the role the policies apply to (G-03).
const connectionString = envOrFile('MIGRATION_DATABASE_URL') ?? envOrFile('DATABASE_URL');
if (!connectionString) {
  console.error('✗ DATABASE_URL not set — cannot run RLS fitness check.');
  process.exit(1);
}

// Kept in lock-step with infrastructure/migrations/0163 (system / pre-tenant tables).
//
// EVERY ENTRY IS A HOLE IN A SECURITY INVARIANT. Being on this list is not evidence that the
// exemption is correct — it only records that someone once decided it. Each therefore carries
// its justification AND its status, and a stale justification is a defect, not a precedent.
const EXCLUDED = new Set([
  // 0163's stated reason: "authentication lookup happens BEFORE a tenant context exists".
  // STALE as of S1 — login now resolves `tenantId` from the request and runs inside
  // TenantContext.run, so the lookup DOES have a tenant. This exemption survives only
  // because UsersService still hydrates every tenant's users at boot with no tenant bound.
  // That is an application defect to fix (S1-RLS.4), not a reason to weaken RLS: the fix is
  // to make hydration tenant-aware, then delete this line.
  'aura_users', // ⚠ EXEMPTION UNDER REVIEW — justification stale, pending S1-RLS.4

  // Genuine chicken-and-egg: `verify(key)` resolves an API key to an account and LEARNS the
  // tenant from the row, so it cannot bind a tenant beforehand. That justifies a pre-tenant
  // *lookup path* — it does NOT by itself justify exempting the whole table from FORCE RLS.
  // The narrower fix (a privileged lookup function or a role limited to key_hash → identity,
  // with all other access policy-governed) has not been attempted yet.
  'aura_service_accounts', // ⚠ EXEMPTION UNDER REVIEW — narrower fix not yet attempted

  'aura_events',                // append-only spine; the outbox relay polls cross-tenant via
                                // the owner/system connection, a controlled path (0163)
  'aura_webhook_subscriptions', // system integration config, delivered by a system worker
  'aura_vector_store',          // AI embedding infrastructure behind a guardrailed service
]);

/**
 * Tables the migration runner itself owns. Not application data: bookkeeping written before
 * any tenant exists, so requiring tenant isolation on them is meaningless.
 */
const INFRASTRUCTURE = new Set(['aura_migrations']);

/** Does this table hold tenant-scoped application data we must guard? */
const isGuarded = (t) => !EXCLUDED.has(t) && !INFRASTRUCTURE.has(t);

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
    WHERE n.nspname='public' AND c.relkind='r'
      AND EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema='public' AND col.table_name=c.relname AND col.column_name='tenant_id')
    ORDER BY c.relname`);

  const scoped = rows.filter((r) => isGuarded(r.table));
  const violations = scoped.filter((r) => !r.rls_enabled || !r.rls_forced || Number(r.policies) === 0);

  const forced = scoped.filter((r) => r.rls_forced).length;
  // Name the non-`aura_*` tables explicitly: they are the ones the old prefix-based
  // discovery could not see, so their presence here is the evidence the gate now covers them.
  const nonPrefixed = scoped.map((r) => r.table).filter((t) => !t.startsWith('aura_'));
  if (nonPrefixed.length > 0) {
    console.log(`RLS fitness now covers ${nonPrefixed.length} non-'aura_' tenant table(s): ${nonPrefixed.join(', ')}`);
  }
  console.log(`RLS fitness: ${scoped.length} tenant-scoped tables · enabled ${scoped.filter((r) => r.rls_enabled).length} · forced ${forced} · with-policy ${scoped.filter((r) => Number(r.policies) > 0).length} · excluded ${rows.length - scoped.length}`);

  if (violations.length > 0) {
    console.error(`\n✗ ${violations.length} table(s) lack enforced tenant isolation:`);
    for (const v of violations) {
      const why = [!v.rls_enabled && 'RLS disabled', !v.rls_forced && 'not FORCED', Number(v.policies) === 0 && 'no policy'].filter(Boolean).join(', ');
      console.error(`  - ${v.table}: ${why}`);
    }
    console.error('\nGive the table ENABLE + FORCE ROW LEVEL SECURITY and a tenant policy in its own');
    console.error('migration, or (if genuinely system/pre-tenant) add it to EXCLUDED here with a justification.');
    await client.end();
    process.exit(1);
  }

  // Deny-all guard (R1 activation closure): ANY table (tenant-scoped or not) with RLS
  // ENABLED but ZERO policies is a trap — `ENABLE` applies to every non-owner role, so under the
  // enforced `aura_app` role that table denies ALL rows (breaking the relay, auth, webhooks, …).
  // A legitimate system/pre-tenant table must have RLS DISABLED, not enabled-without-a-policy.
  const { rows: allRls } = await client.query(`
    SELECT c.relname AS table, c.relrowsecurity AS rls_enabled,
           (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'`);
  const denyAll = allRls
    .filter((r) => !INFRASTRUCTURE.has(r.table))
    .filter((r) => r.rls_enabled && Number(r.policies) === 0);
  if (denyAll.length > 0) {
    console.error(`\n✗ ${denyAll.length} table(s) have RLS ENABLED with no policy — DENY-ALL under the non-owner app role:`);
    for (const v of denyAll) console.error(`  - ${v.table}`);
    console.error('\nGive the table a policy (tenant or parent-join), or DISABLE ROW LEVEL SECURITY if it is a system/pre-tenant table.');
    await client.end();
    process.exit(1);
  }

  console.log('✓ every tenant-scoped business table has RLS enabled + FORCED + a policy; no enabled-but-unpolicied (deny-all) tables.');
  await client.end();
}
main().catch((e) => { console.error('✗ RLS fitness error:', e.message); process.exit(1); });
