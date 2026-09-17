#!/usr/bin/env node
/**
 * QC-01 — BACKFILL legacy quotations into families, offers and revisions.
 *
 * Run the census FIRST (`qc-01-legacy-census.mjs`). This script REFUSES to run where that census
 * would report alternate semantics, because the simple mapping would then assert that a supplier
 * offered one thing when they offered more than one — and inventing an offer structure the data does
 * not carry is worse than leaving the rows alone.
 *
 * THE MAPPING, for a database with no legacy alternates:
 *
 *   legacy quotation  →  one FAMILY (supplier + RFQ)
 *                     →  one BASE offer
 *                     →  one REVISION numbered 0, marked origin = 'legacy_migration'
 *                     →  status CONFIRMED, so it is the commercially effective offer
 *   its lines         →  revision_id set; quotation_id LEFT IN PLACE for lineage
 *
 * Rev 0 is AURA'S OWN marker, not the supplier's. `supplier_revision_ref` stays NULL and `origin`
 * says where the row came from, so nothing can later read as though the supplier called it Rev 0.
 *
 * IDEMPOTENT: every insert is keyed off the legacy quotation id, so a second run changes nothing.
 * TRANSACTIONAL: one transaction for the whole backfill — a half-migrated quotation is worse than an
 * un-migrated one.
 *
 *   node apps/api/scripts/qc-01-backfill.mjs            # backfill, then verify
 *   node apps/api/scripts/qc-01-backfill.mjs --verify   # verify only, writes nothing
 */
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const verifyOnly = process.argv.includes('--verify');

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
if (!url) { console.error('No database connection. This backfill will not guess at one.'); process.exit(2); }
const pool = new Pool({ connectionString: url, statement_timeout: 120_000, application_name: 'qc-01-backfill' });

/** Refuse a role that cannot see every tenant: a partial backfill is worse than none. */
const { rows: [who] } = await pool.query(
  `SELECT current_user AS who,
          (SELECT count(*) FROM pg_roles WHERE rolname = current_user AND rolbypassrls) AS bypasses,
          (SELECT count(*) FROM pg_roles WHERE rolname = current_user AND rolsuper) AS superuser,
          pg_catalog.pg_get_userbyid(relowner) = current_user AS owns
     FROM pg_class WHERE relname = 'aura_procurement_rfq_quotes' LIMIT 1`);
if (!who || (!who.owns && Number(who.bypasses) === 0 && Number(who.superuser) === 0)) {
  console.error(`Refusing to run as '${who?.who ?? 'unknown'}': row-level security would hide other tenants'`);
  console.error('quotations, and a backfill that silently skips them is worse than one that never ran.');
  await pool.end(); process.exit(2);
}

/** The census gate, re-checked here rather than trusted from a separate run. */
const { rows: [shape] } = await pool.query(`
  SELECT count(*) FILTER (WHERE alternates > 0)::int AS with_alternates
    FROM (SELECT q.id, count(l.id) FILTER (WHERE l.is_alternate) AS alternates
            FROM public.aura_procurement_rfq_quotes q
            LEFT JOIN public.aura_procurement_quotation_lines l ON l.quotation_id = q.id
           GROUP BY q.id) s`);
if (Number(shape.with_alternates) > 0 && !verifyOnly) {
  console.error(`Refusing: ${shape.with_alternates} legacy quotation(s) carry alternate lines.`);
  console.error('The simple mapping would fold them into the base offer and assert the supplier');
  console.error('offered one thing when they offered more. Resolve the grouping first — and where it');
  console.error('cannot be demonstrated, preserve them as a legacy alternative with grouping UNKNOWN.');
  await pool.end(); process.exit(2);
}

if (!verifyOnly) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Families: one per legacy quotation, keyed off the quotation id so a rerun is a no-op.
    await client.query(`
      INSERT INTO public.aura_procurement_quotation_families
        (id, tenant_id, company_id, rfq_id, supplier_id, supplier_name, supplier_quotation_ref, created_at)
      -- company_id is text on the legacy table and uuid on the new one. Cast explicitly and treat a
      -- non-uuid legacy value as UNKNOWN rather than failing the whole backfill on one bad row.
      SELECT q.id, q.tenant_id,
             CASE WHEN q.company_id ~ '^[0-9a-fA-F-]{36}$' THEN q.company_id::uuid ELSE NULL END,
             q.rfq_id, q.supplier_id, q.supplier_name, NULL, q.created_at
        FROM public.aura_procurement_rfq_quotes q
       WHERE NOT EXISTS (SELECT 1 FROM public.aura_procurement_quotation_families f WHERE f.id = q.id)`);

    await client.query(`
      INSERT INTO public.aura_procurement_quotation_offers (id, tenant_id, family_id, kind, label, created_at)
      SELECT f.id, f.tenant_id, f.id, 'base', NULL, f.created_at
        FROM public.aura_procurement_quotation_families f
        -- ONLY families that came from a legacy quotation. A family opened through the capture
        -- screen already has its own base offer with its own id, and this backfill has no business
        -- touching it.
       WHERE EXISTS (SELECT 1 FROM public.aura_procurement_rfq_quotes q WHERE q.id = f.id)
         -- Absence of ANY base offer, not absence of one with this id: a family may legitimately
         -- have a base offer under a different id, and inserting a second is what the partial
         -- unique index is there to refuse.
         AND NOT EXISTS (
           SELECT 1 FROM public.aura_procurement_quotation_offers o
            WHERE o.family_id = f.id AND o.kind = 'base')`);

    // Rev 0, marked as AURA's own migration revision and confirmed so it is the effective offer.
    await client.query(`
      INSERT INTO public.aura_procurement_quotation_revisions
        (id, tenant_id, offer_id, revision_no, supplier_revision_ref, origin, received_at,
         quotation_date, validity_date, currency, tax_treatment, tax_rate_pct, freight_amount,
         freight_terms, payment_terms, notes, status, created_at)
      SELECT q.id, q.tenant_id, q.id, 0, NULL, 'legacy_migration', q.created_at,
             NULL, q.validity_date, q.currency, q.tax_treatment, q.tax_rate_pct, q.freight_amount,
             q.freight_terms, q.payment_terms, q.notes, 'confirmed', q.created_at
        FROM public.aura_procurement_rfq_quotes q
       WHERE NOT EXISTS (SELECT 1 FROM public.aura_procurement_quotation_revisions r WHERE r.id = q.id)`);

    // Lines point at the revision. quotation_id is LEFT IN PLACE: lineage stays inspectable until
    // the retirement step, and nothing is lost if this has to be re-examined.
    const lines = await client.query(`
      UPDATE public.aura_procurement_quotation_lines l
         SET revision_id = l.quotation_id
       WHERE l.revision_id IS NULL AND l.quotation_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.aura_procurement_quotation_revisions r WHERE r.id = l.quotation_id)`);

    await client.query('COMMIT');
    console.log(`\nBackfilled. ${lines.rowCount} line(s) bound to a revision.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\nBackfill ROLLED BACK — nothing was written.');
    throw error;
  } finally {
    client.release();
  }
}

// ── VERIFY: counts, lineage and values, as the staged plan requires ────────
const [{ rows: [counts] }, { rows: mismatches }, { rows: orphans }] = await Promise.all([
  pool.query(`
    SELECT (SELECT count(*) FROM public.aura_procurement_rfq_quotes)                                         AS legacy_quotations,
           (SELECT count(*) FROM public.aura_procurement_quotation_families f
             WHERE EXISTS (SELECT 1 FROM public.aura_procurement_rfq_quotes q WHERE q.id = f.id))              AS families,
           (SELECT count(*) FROM public.aura_procurement_quotation_offers o
             WHERE o.kind = 'base' AND EXISTS (SELECT 1 FROM public.aura_procurement_rfq_quotes q WHERE q.id = o.family_id)) AS base_offers,
           (SELECT count(*) FROM public.aura_procurement_quotation_revisions WHERE origin = 'legacy_migration') AS migrated_revisions,
           (SELECT count(*) FROM public.aura_procurement_quotation_revisions WHERE origin = 'legacy_migration' AND status = 'confirmed') AS confirmed,
           (SELECT count(*) FROM public.aura_procurement_quotation_lines WHERE quotation_id IS NOT NULL)      AS legacy_lines,
           (SELECT count(*) FROM public.aura_procurement_quotation_lines WHERE quotation_id IS NOT NULL AND revision_id IS NOT NULL) AS lines_bound`),
  // VALUES, not merely counts: every commercial fact must have survived unchanged.
  pool.query(`
    SELECT q.id
      FROM public.aura_procurement_rfq_quotes q
      JOIN public.aura_procurement_quotation_revisions r ON r.id = q.id
     WHERE q.currency IS DISTINCT FROM r.currency
        OR q.tax_treatment IS DISTINCT FROM r.tax_treatment
        OR q.tax_rate_pct IS DISTINCT FROM r.tax_rate_pct
        OR q.freight_amount IS DISTINCT FROM r.freight_amount
        OR q.freight_terms IS DISTINCT FROM r.freight_terms
        OR q.payment_terms IS DISTINCT FROM r.payment_terms
        OR q.validity_date IS DISTINCT FROM r.validity_date`),
  // LINEAGE: no line may point at a revision that does not exist.
  pool.query(`
    SELECT l.id FROM public.aura_procurement_quotation_lines l
     WHERE l.revision_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.aura_procurement_quotation_revisions r WHERE r.id = l.revision_id)`),
]);

console.log('\n── Backfill verification ───────────────────────────────');
for (const [label, a, b] of [
  ['legacy quotations → families', counts.legacy_quotations, counts.families],
  ['families → base offers', counts.families, counts.base_offers],
  ['legacy quotations → migrated revisions', counts.legacy_quotations, counts.migrated_revisions],
  ['migrated revisions confirmed', counts.migrated_revisions, counts.confirmed],
  ['legacy lines → bound to a revision', counts.legacy_lines, counts.lines_bound],
]) {
  console.log(`   ${String(a) === String(b) ? 'OK  ' : 'FAIL'} ${label.padEnd(40)} ${a} → ${b}`);
}
console.log(`   ${mismatches.length === 0 ? 'OK  ' : 'FAIL'} commercial values unchanged             ${mismatches.length} mismatch(es)`);
console.log(`   ${orphans.length === 0 ? 'OK  ' : 'FAIL'} line lineage resolves                   ${orphans.length} orphan(s)`);

const ok = String(counts.legacy_quotations) === String(counts.families)
  && String(counts.families) === String(counts.base_offers)
  && String(counts.legacy_quotations) === String(counts.migrated_revisions)
  && String(counts.migrated_revisions) === String(counts.confirmed)
  && String(counts.legacy_lines) === String(counts.lines_bound)
  && mismatches.length === 0 && orphans.length === 0;

console.log(ok ? '\n   VERIFIED. Safe to switch SUP-06 reads onto revisions.\n'
                : '\n   NOT VERIFIED. Do not switch reads until every line above is OK.\n');
await pool.end();
process.exit(ok ? 0 : 1);
