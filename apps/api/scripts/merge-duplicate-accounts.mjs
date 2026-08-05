#!/usr/bin/env node
// Merge duplicate CRM accounts — gap register G-11.
//
// The dev database accumulated the same customer several times over (five names triplicated at the
// time of writing). Duplicates are not cosmetic: "which Majid Al Futtaim?" is unanswerable, the
// account 360 splits one customer's history across three records, and the CRM close-out audit holds
// its sign-off on exactly this.
//
// DRY RUN BY DEFAULT. Nothing is written without `--apply`, and even then the script:
//   • picks the survivor deterministically (oldest by created_at — the one history hangs off)
//   • re-points every referencing row in ONE transaction, so a failure leaves the DB untouched
//   • writes an undo file mapping every moved row back to its original account
//   • never deletes: `aura_crm_accounts` has no soft-delete column, so a loser is RENAMED to record
//     where its history went (`Name [merged→abc12345]`) and left in place, queryable. A merge you
//     cannot reverse is not a merge, it is a deletion.
//
// Usage:
//   node scripts/merge-duplicate-accounts.mjs                  # report only
//   node scripts/merge-duplicate-accounts.mjs --tenant=X       # scope to one tenant
//   node scripts/merge-duplicate-accounts.mjs --apply          # execute, writes undo-<ts>.json
//
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const TENANT = (argv.find((a) => a.startsWith('--tenant=')) || '').split('=')[1] || null;

/**
 * Every table carrying `account_id`, discovered rather than hardcoded so a new module cannot
 * silently be left behind. Views are excluded — they have no rows of their own.
 */
const REFERENCING_TABLES_SQL = `
  SELECT c.table_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = 'public'
    AND c.column_name = 'account_id'
    AND t.table_type = 'BASE TABLE'
    AND c.table_name LIKE 'aura_%'
    AND c.table_name <> 'aura_crm_accounts'
  ORDER BY c.table_name`;

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = path.join(HERE, '..', '.env.local');
  if (!fs.existsSync(envFile)) throw new Error('No DATABASE_URL and no apps/api/.env.local');
  const m = fs.readFileSync(envFile, 'utf8').match(/DATABASE_URL=(.*)/);
  if (!m) throw new Error('DATABASE_URL not found in apps/api/.env.local');
  return m[1].trim();
}

async function main() {
  const client = new pg.Client({ connectionString: readDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const tables = (await client.query(REFERENCING_TABLES_SQL)).rows.map((r) => r.table_name);

  const dupSql = `
    SELECT lower(btrim(name)) AS key, tenant_id, count(*)::int AS n
    FROM aura_crm_accounts
    WHERE name NOT LIKE '%[merged→%' ${TENANT ? 'AND tenant_id = $1' : ''}
    GROUP BY 1, 2 HAVING count(*) > 1
    ORDER BY n DESC, 1`;
  const groups = (await client.query(dupSql, TENANT ? [TENANT] : [])).rows;

  if (groups.length === 0) {
    console.log('No duplicate account names found. Nothing to do.');
    await client.end();
    return;
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${groups.length} duplicate group(s) across ${tables.length} referencing table(s)\n`);

  const undo = { startedAt: new Date().toISOString(), moves: [], retired: [] };
  let totalMoved = 0;

  for (const g of groups) {
    const members = (
      await client.query(
        `SELECT id, name, created_at FROM aura_crm_accounts
         WHERE lower(btrim(name)) = $1 AND tenant_id = $2 AND name NOT LIKE '%[merged→%'
         ORDER BY created_at ASC, id ASC`,
        [g.key, g.tenant_id],
      )
    ).rows;
    const [survivor, ...losers] = members;

    console.log(`"${survivor.name}"  (tenant ${g.tenant_id})`);
    console.log(`   survivor  ${survivor.id}  created ${String(survivor.created_at).slice(0, 10)}`);

    for (const loser of losers) {
      const perTable = [];
      for (const table of tables) {
        // account_id is `text` on some tables and `uuid` on others — compare as text throughout.
        const { rows } = await client.query(`SELECT id FROM ${table} WHERE account_id::text = $1`, [loser.id]);
        if (rows.length) perTable.push({ table, ids: rows.map((r) => r.id) });
      }
      const moved = perTable.reduce((n, t) => n + t.ids.length, 0);
      totalMoved += moved;
      console.log(
        `   merge     ${loser.id}  created ${String(loser.created_at).slice(0, 10)}  → ${moved} row(s)` +
          (perTable.length ? `: ${perTable.map((t) => `${t.table.replace('aura_', '')}×${t.ids.length}`).join(', ')}` : ''),
      );
      undo.moves.push({ from: survivor.id, to: loser.id, tables: perTable });
      undo.retired.push({ id: loser.id, name: loser.name });
    }
    console.log('');
  }

  if (!APPLY) {
    console.log(`Would re-point ${totalMoved} row(s) and retire ${undo.retired.length} account(s).`);
    console.log('Re-run with --apply to execute. An undo file will be written.');
    await client.end();
    return;
  }

  await client.query('BEGIN');
  try {
    for (const move of undo.moves) {
      for (const { table, ids } of move.tables) {
        await client.query(`UPDATE ${table} SET account_id = $1 WHERE id::text = ANY($2::text[])`, [move.from, ids.map(String)]);
      }
    }
    // Retire, never delete: the row stays queryable and the rename records where it went.
    for (const r of undo.retired) {
      await client.query(
        `UPDATE aura_crm_accounts SET name = $2 || ' [merged→' || left($3, 8) || ']' WHERE id::text = $1`,
        [r.id, r.name, undo.moves.find((m) => m.to === r.id).from],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`\nFAILED — rolled back, nothing changed: ${err.message}`);
    await client.end();
    process.exit(1);
  }

  const undoPath = path.join(HERE, `undo-account-merge-${Date.now()}.json`);
  fs.writeFileSync(undoPath, JSON.stringify(undo, null, 2));
  console.log(`Merged ${totalMoved} row(s); retired ${undo.retired.length} account(s).`);
  console.log(`Undo map written to ${undoPath} — every moved row is listed with its original account.`);
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
