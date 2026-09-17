#!/usr/bin/env node
/**
 * FX-01 — HISTORICAL IMPACT AUDIT.
 *
 * Fixing the code stops new damage. It says nothing about what was already booked, and that is the
 * half nobody can infer from a green test run: every foreign-currency invoice created before the
 * strict path existed was valued by `getRate()`, which could not refuse. Some of those numbers came
 * from a governed rate. Some came from a hardcoded peg. Some — any currency outside the five AURA
 * governs — came from the USD peg applied to a currency that has nothing to do with the dollar.
 *
 * THIS SCRIPT READS ONLY. It classifies; it does not correct, restate or backfill anything. A
 * restatement is an accounting decision with a period, an approver and a journal behind it, and it
 * is not a script's to make.
 *
 * The classification, in order of how wrong the number can be:
 *
 *   UNGOVERNABLE_CURRENCY  The currency is not one AURA can hold a rate for at all, so whatever
 *                          rate was booked came from the USD-peg cross. This is the JPY case: a
 *                          1,000,000 JPY invoice booked as AED 3,672,500. Treat every one of these
 *                          as wrong until somebody checks it.
 *
 *   NO_GOVERNED_RATE       A governable currency, but no rate in `aura_exchange_rates` covers the
 *                          invoice's own date. The booked rate therefore cannot have come from the
 *                          register — it came from a peg. For USD and SAR the peg is the real peg
 *                          and the number is probably right; for EUR and GBP it is a hardcoded
 *                          constant for a floating currency and the number is a guess.
 *
 *   RATE_DISAGREES         A governed rate DOES cover the invoice's date and it is not the rate the
 *                          invoice carries. Either the register was corrected afterwards or the
 *                          booking never consulted it. Worth a human look either way.
 *
 *   MATCHES_GOVERNED       The booked rate equals the governed rate for its date. Almost certainly
 *                          fine, and the only class that needs nothing.
 *
 * Rows booked AFTER the remediation carry provenance (`exchange_rate_source`) and are reported
 * separately: they are not legacy and are not audited here.
 *
 *   node apps/api/scripts/fx-01-impact-audit.mjs                 # summary
 *   node apps/api/scripts/fx-01-impact-audit.mjs --detail        # every affected row
 *   node apps/api/scripts/fx-01-impact-audit.mjs --json          # machine-readable
 */
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GOVERNABLE = ['AED', 'USD', 'EUR', 'SAR', 'GBP'];
const BASE = 'AED';
const detail = process.argv.includes('--detail');
const asJson = process.argv.includes('--json');

/**
 * THE OWNER CONNECTION, NOT THE APPLICATION ONE.
 *
 * This audit is deliberately CROSS-TENANT: the question is how many booked rows across the whole
 * database were valued by the fallback, and no single tenant can see that. The `aura_app` role is
 * subject to RLS and answers only for the tenant bound to the connection, so running this as the
 * application role returns ZERO AFFECTED ROWS and looks like a clean bill of health. It is not one;
 * it is the row-level policy doing its job. Read as the migration/owner role, which is the same
 * role that applies schema changes and the only one entitled to a whole-database answer.
 */
function databaseUrl() {
  if (process.env.MIGRATION_DATABASE_URL) return process.env.MIGRATION_DATABASE_URL;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(here, '../.env.local');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(String.fromCharCode(10))) {
      if (line.startsWith('MIGRATION_DATABASE_URL=')) return line.split('MIGRATION_DATABASE_URL=')[1].trim();
    }
  }
  return process.env.DATABASE_URL ?? process.env.LOCAL_DATABASE_URL;
}

/** The governed rate covering `onDate`, direct or inverse — the same rule the strict resolver uses. */
async function governedRate(pool, tenantId, from, onDate) {
  const direct = await pool.query(
    `SELECT rate::float AS rate, effective_date::text AS d FROM public.aura_exchange_rates
     WHERE tenant_id = $1 AND from_currency = $2 AND to_currency = $3 AND effective_date <= $4
     ORDER BY effective_date DESC LIMIT 1`,
    [tenantId, from, BASE, onDate],
  );
  if (direct.rows[0]) return { rate: direct.rows[0].rate, effectiveDate: direct.rows[0].d };
  const inverse = await pool.query(
    `SELECT rate::float AS rate, effective_date::text AS d FROM public.aura_exchange_rates
     WHERE tenant_id = $1 AND from_currency = $2 AND to_currency = $3 AND effective_date <= $4
     ORDER BY effective_date DESC LIMIT 1`,
    [tenantId, BASE, from, onDate],
  );
  if (inverse.rows[0]) return { rate: 1 / inverse.rows[0].rate, effectiveDate: inverse.rows[0].d };
  return null;
}

async function classify(pool, rows, label) {
  const out = { label, total: rows.length, booked_after_remediation: 0, classes: {}, rows: [] };
  for (const r of rows) {
    if (r.provenance) { out.booked_after_remediation += 1; continue; }
    const currency = String(r.currency ?? BASE).toUpperCase();
    const booked = Number(r.exchange_rate);
    let verdict;
    let governed = null;

    if (!GOVERNABLE.includes(currency)) {
      verdict = 'UNGOVERNABLE_CURRENCY';
    } else {
      governed = await governedRate(pool, r.tenant_id, currency, r.on_date);
      if (!governed) verdict = 'NO_GOVERNED_RATE';
      else if (Math.abs(governed.rate - booked) > 1e-6) verdict = 'RATE_DISAGREES';
      else verdict = 'MATCHES_GOVERNED';
    }

    out.classes[verdict] = (out.classes[verdict] ?? 0) + 1;
    if (verdict !== 'MATCHES_GOVERNED') {
      out.rows.push({
        id: r.id, tenant: r.tenant_id, ref: r.ref, currency, onDate: r.on_date,
        value: Number(r.value), bookedRate: booked, bookedBase: Number(r.base_value),
        governedRate: governed?.rate ?? null,
        baseIfGoverned: governed ? Number((Number(r.value) * governed.rate).toFixed(2)) : null,
        verdict,
      });
    }
  }
  return out;
}

const url = databaseUrl();
if (!url) {
  console.error('No DATABASE_URL. This audit reads a real database and will not guess at one.');
  process.exit(2);
}
const pool = new Pool({
  connectionString: url,
  // A live environment must not be hostage to this script. A slow full scan is a failed audit,
  // never a stalled database.
  statement_timeout: 60_000,
  query_timeout: 60_000,
  connectionTimeoutMillis: 15_000,
  max: 2,
  application_name: 'fx-01-impact-audit (read-only)',
});

/**
 * READ-ONLY, ENFORCED BY POSTGRES RATHER THAN PROMISED BY ME.
 *
 * This audit is meant to be safe to point at a real, shared database, and "it only contains SELECTs"
 * is an assurance a reader has to verify by reading every line. `default_transaction_read_only`
 * makes the server refuse any INSERT, UPDATE, DELETE or DDL on this connection outright — so a
 * mistake in this file, or a later edit to it, cannot write to the database it is auditing.
 */
pool.on('connect', (client) => {
  void client.query('SET default_transaction_read_only = on');
});

/**
 * Refuse to report on a connection that cannot see across tenants. Without this the script happily
 * prints "0 affected rows" from behind an RLS policy — the most dangerous possible output, because
 * it reads as an all-clear.
 */
async function assertCrossTenantVisibility() {
  const { rows } = await pool.query(
    `SELECT current_user AS who,
            (SELECT count(*) FROM pg_roles WHERE rolname = current_user AND rolbypassrls) AS bypasses,
            (SELECT count(*) FROM pg_roles WHERE rolname = current_user AND rolsuper) AS superuser,
            pg_catalog.pg_get_userbyid(relowner) = current_user AS owns
       FROM pg_class WHERE relname = 'aura_finance_invoices' LIMIT 1`,
  );
  const r = rows[0];
  if (!r || (!r.owns && Number(r.bypasses) === 0 && Number(r.superuser) === 0)) {
    console.error(`Refusing to audit as '${r?.who ?? 'unknown'}': this role is subject to row-level security,`);
    console.error('so it can only see one tenant and would report a false all-clear.');
    console.error('Set MIGRATION_DATABASE_URL to the owner connection and run again.');
    await pool.end();
    process.exit(2);
  }
}
await assertCrossTenantVisibility();

/** Prove the read-only setting actually took, rather than assuming the SET ran. */
async function assertReadOnly() {
  const { rows } = await pool.query('SHOW default_transaction_read_only');
  if (rows[0]?.default_transaction_read_only !== 'on') {
    console.error('Refusing to audit: the connection is not read-only, so a mistake here could write.');
    await pool.end();
    process.exit(2);
  }
  try {
    await pool.query('CREATE TEMP TABLE fx01_write_probe (x int)');
    console.error('Refusing to audit: a write succeeded on a connection that reported read-only.');
    await pool.end();
    process.exit(2);
  } catch {
    // Expected — the server refused the write, which is the guarantee this audit runs under.
  }
}
await assertReadOnly();


/**
 * DOES THIS DATABASE KNOW ABOUT PROVENANCE YET?
 *
 * The audit's whole purpose is to examine rows booked BEFORE the remediation, so it must run against
 * a schema that predates migration 0348 — where `exchange_rate_source` and `invoice_date` do not
 * exist. Selecting them unconditionally would make the audit fail on exactly the databases it was
 * written for. Where they are absent, every foreign-currency row is legacy by definition.
 */
async function columnsPresent(table, names) {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2)`,
    [table, names],
  );
  const found = new Set(rows.map((r) => r.column_name));
  return Object.fromEntries(names.map((n) => [n, found.has(n)]));
}

try {
  // AP: the FX date is the supplier's invoice date where known, else the date it was entered.
  const apCols = await columnsPresent('aura_finance_invoices', ['exchange_rate_source', 'invoice_date']);
  const ap = await pool.query(
    `SELECT id, tenant_id, reference AS ref, currency, value::float AS value, exchange_rate::float AS exchange_rate,
            base_value::float AS base_value,
            ${apCols.exchange_rate_source ? 'exchange_rate_source' : 'NULL'} AS provenance,
            ${apCols.invoice_date ? 'COALESCE(invoice_date, created_at::date)' : 'created_at::date'}::text AS on_date
       FROM public.aura_finance_invoices
      WHERE COALESCE(UPPER(currency), $1) <> $1`,
    [BASE],
  );
  const arCols = await columnsPresent('aura_finance_customer_invoices', ['exchange_rate_source']);
  const ar = await pool.query(
    `SELECT id, tenant_id, invoice_number AS ref, currency, total::float AS value, exchange_rate::float AS exchange_rate,
            base_total::float AS base_value,
            ${arCols.exchange_rate_source ? 'exchange_rate_source' : 'NULL'} AS provenance,
            issue_date::text AS on_date
       FROM public.aura_finance_customer_invoices
      WHERE COALESCE(UPPER(currency), $1) <> $1`,
    [BASE],
  );

  const report = {
    generatedAt: new Date().toISOString(),
    defect: 'FX-01',
    reads_only: true,
    schema: {
      provenance_columns_present: apCols.exchange_rate_source && arCols.exchange_rate_source,
      note: apCols.exchange_rate_source
        ? 'migration 0348 applied — rows carrying provenance are post-remediation'
        : 'migration 0348 NOT applied — every foreign-currency row here predates the remediation',
    },
    ap: await classify(pool, ap.rows, 'AP supplier invoices'),
    ar: await classify(pool, ar.rows, 'AR customer invoices'),
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`
schema: ${report.schema.note}`);
    for (const side of [report.ap, report.ar]) {
      console.log(`\n── ${side.label} ─────────────────────────────`);
      console.log(`   foreign-currency rows: ${side.total}`);
      console.log(`   booked after remediation (carry provenance, not legacy): ${side.booked_after_remediation}`);
      const legacy = side.total - side.booked_after_remediation;
      console.log(`   legacy rows audited: ${legacy}`);
      if (legacy === 0) { console.log('   nothing to classify.'); continue; }
      for (const [verdict, n] of Object.entries(side.classes)) console.log(`     ${verdict.padEnd(22)} ${n}`);
      if (detail) {
        for (const row of side.rows) {
          const restated = row.baseIfGoverned === null ? 'unknown' : row.baseIfGoverned.toLocaleString();
          console.log(`     · ${row.ref ?? row.id} ${row.value.toLocaleString()} ${row.currency} @${row.bookedRate}` +
            ` → booked ${row.bookedBase.toLocaleString()} ${BASE} | governed would give ${restated} | ${row.verdict}`);
        }
      }
    }
    console.log('\nThis is a classification, not a correction. Restating a booked invoice is an');
    console.log('accounting decision with a period and an approver behind it, and this script makes none.');
  }
} finally {
  await pool.end();
}
