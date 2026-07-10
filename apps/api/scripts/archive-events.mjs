// Cold-storage roll for the append-only kernel tables (gap register Vol 23 #25, Vol 8 §8).
// Moves aura_events (only PROCESSED ones — pending outbox rows never move) and
// aura_audit_log rows older than the cutoff into *_archive twins (created on demand,
// same shape), in transactional batches. Closed-period financial data stays hot by
// design — this touches only the event spine and audit trail.
//
//   DATABASE_URL=... node scripts/archive-events.mjs                 # dry-run (counts only)
//   DATABASE_URL=... node scripts/archive-events.mjs --execute       # actually move
//   ... --months=12 --batch=5000                                     # tune cutoff/batch
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, '..', '.env.local') });

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const months = Number(arg('months', '12'));
const batch = Number(arg('batch', '5000'));
const execute = process.argv.includes('--execute');

// table → [time column, extra predicate no row may escape]
const TARGETS = [
  ['aura_events', 'occurred_at', 'processed_at is not null'],
  ['aura_audit_log', 'created_at', 'true'],
];

const envOrFile = (name) => {
  const file = process.env[`${name}_FILE`]?.trim();
  if (file) return readFileSync(file, 'utf8').trim() || null;
  return process.env[name]?.trim() || null;
};
const url = envOrFile('DATABASE_URL');
if (!url) {
  console.error('✗ DATABASE_URL is not set — cannot archive.');
  process.exit(1);
}
const sslOff = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(url) || /[?&]sslmode=disable/.test(url);
const client = new pg.Client({ connectionString: url, ssl: sslOff ? false : { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log(`Archive cutoff: rows older than ${months} month(s). Mode: ${execute ? 'EXECUTE' : 'dry-run'}.`);
  for (const [table, timeCol, extra] of TARGETS) {
    const eligible = await client.query(
      `select count(*)::int as n from public.${table}
       where ${timeCol} < now() - interval '${months} months' and ${extra}`,
    );
    const n = eligible.rows[0].n;
    console.log(`${table}: ${n} row(s) eligible`);
    if (!execute || n === 0) continue;

    await client.query(
      `create table if not exists public.${table}_archive (like public.${table} including all)`,
    );
    let moved = 0;
    while (moved < n) {
      await client.query('BEGIN');
      try {
        const { rowCount } = await client.query(
          `with batch as (
             delete from public.${table}
             where id in (
               select id from public.${table}
               where ${timeCol} < now() - interval '${months} months' and ${extra}
               order by ${timeCol}
               limit ${batch}
             )
             returning *
           )
           insert into public.${table}_archive select * from batch`,
        );
        await client.query('COMMIT');
        if (rowCount === 0) break;
        moved += rowCount;
        console.log(`  → moved ${moved}/${n}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    console.log(`✓ ${table}: ${moved} row(s) archived to ${table}_archive`);
  }
}

main()
  .catch((err) => {
    console.error(`\n✗ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => client.end());
