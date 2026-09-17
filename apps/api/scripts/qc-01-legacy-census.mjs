#!/usr/bin/env node
/**
 * QC-01 — LEGACY QUOTATION CENSUS. Run this BEFORE any backfill, against the database to be migrated.
 *
 * The frozen migration rule is that a legacy quotation becomes one family, one base offer, one
 * internal Rev 0 — but ONLY where there are no legacy alternate semantics. Where `is_alternate` rows
 * exist they must not be swept into the base offer, because that silently asserts a supplier offered
 * one thing when they offered two. This script establishes which case a database is in, rather than
 * assuming the easy one.
 *
 * It READS ONLY, enforced by the server, and it refuses a role that cannot see across tenants —
 * an RLS-bound connection would report a reassuring zero (the same trap the FX-01 audit fell into).
 *
 *   MIGRATION_DATABASE_URL='<owner connection>' node apps/api/scripts/qc-01-legacy-census.mjs
 */
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function databaseUrl() {
  if (process.env.MIGRATION_DATABASE_URL) return process.env.MIGRATION_DATABASE_URL;
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env.local');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(String.fromCharCode(10))) {
      if (line.startsWith('MIGRATION_DATABASE_URL=')) return line.split('MIGRATION_DATABASE_URL=')[1].trim();
    }
  }
  return process.env.DATABASE_URL;
}

const url = databaseUrl();
if (!url) { console.error('No database connection. This census reads a real database and will not guess at one.'); process.exit(2); }

const pool = new Pool({ connectionString: url, statement_timeout: 60_000, connectionTimeoutMillis: 15_000, max: 2, application_name: 'qc-01-legacy-census (read-only)' });
pool.on('connect', (c) => { void c.query('SET default_transaction_read_only = on'); });

const { rows: [who] } = await pool.query(
  `SELECT current_user AS who,
          (SELECT count(*) FROM pg_roles WHERE rolname = current_user AND rolbypassrls) AS bypasses,
          (SELECT count(*) FROM pg_roles WHERE rolname = current_user AND rolsuper) AS superuser,
          pg_catalog.pg_get_userbyid(relowner) = current_user AS owns
     FROM pg_class WHERE relname = 'aura_procurement_rfq_quotes' LIMIT 1`,
);
if (!who || (!who.owns && Number(who.bypasses) === 0 && Number(who.superuser) === 0)) {
  console.error(`Refusing to census as '${who?.who ?? 'unknown'}': this role is subject to row-level security and`);
  console.error('would report only one tenant, which reads as a reassuring zero. Use the owner connection.');
  await pool.end();
  process.exit(2);
}

const q = async (sql) => (await pool.query(sql)).rows;

const [totals] = await q(`
  SELECT
    (SELECT count(*) FROM public.aura_procurement_rfq_quotes)                        AS quotations,
    (SELECT count(DISTINCT tenant_id) FROM public.aura_procurement_rfq_quotes)       AS tenants,
    (SELECT count(*) FROM public.aura_procurement_quotation_lines)                   AS lines,
    (SELECT count(*) FROM public.aura_procurement_quotation_lines WHERE is_alternate) AS alternate_lines`);

// The classification the backfill branches on, per quotation.
const shape = await q(`
  SELECT shape, count(*)::int AS quotations FROM (
    SELECT q.id,
           CASE
             WHEN count(l.id) = 0                                   THEN 'no lines (header only)'
             WHEN count(l.id) FILTER (WHERE l.is_alternate) = 0      THEN 'base only'
             WHEN count(l.id) FILTER (WHERE NOT l.is_alternate) = 0  THEN 'ALTERNATE ONLY'
             ELSE 'MIXED base and alternate'
           END AS shape
      FROM public.aura_procurement_rfq_quotes q
      LEFT JOIN public.aura_procurement_quotation_lines l ON l.quotation_id = q.id
     GROUP BY q.id
  ) s GROUP BY shape ORDER BY 2 DESC`);

console.log('\n── Legacy quotation census ─────────────────────────────');
console.log(`   quotations        ${totals.quotations}   across ${totals.tenants} tenant(s)`);
console.log(`   quotation lines   ${totals.lines}`);
console.log(`   alternate lines   ${totals.alternate_lines}`);
console.log('\n   shape of each quotation:');
for (const row of shape) console.log(`     ${String(row.quotations).padStart(6)}  ${row.shape}`);

const needsJudgement = shape.filter((r) => r.shape !== 'base only' && r.shape !== 'no lines (header only)');
console.log('');
if (needsJudgement.length === 0) {
  console.log('   VERDICT: no legacy alternate semantics. The simple mapping is safe —');
  console.log('   each quotation becomes one family, one BASE offer, one internal Rev 0 (confirmed).');
} else {
  console.log('   VERDICT: ALTERNATE SEMANTICS PRESENT. The simple mapping would assert that these');
  console.log('   suppliers offered one thing when they offered more than one. Non-alternate lines go');
  console.log('   to the base offer; alternate lines go to a separate offer ONLY where the grouping can');
  console.log('   be demonstrated. Where it cannot, preserve them as a legacy alternative with the');
  console.log('   grouping recorded as UNKNOWN — do not invent a structure the data does not carry.');
  for (const row of needsJudgement) console.log(`     ${row.quotations} quotation(s): ${row.shape}`);
}
console.log('');
await pool.end();
