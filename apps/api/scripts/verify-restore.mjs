// Restore-drill verifier (gap register Vol 23 #5). Compares per-table row counts
// between the source database and a restored copy — any drift or an empty source
// fails the drill. Run with the source frozen (API stopped) so counts are stable.
//   SOURCE_URL=postgres://... RESTORE_URL=postgres://... node scripts/verify-restore.mjs
import pg from 'pg';

const sslFor = (url) =>
  /(@|\/\/)(localhost|127\.0\.0\.1)/.test(url) || /[?&]sslmode=disable/.test(url)
    ? false
    : { rejectUnauthorized: false };

async function tableCounts(url) {
  const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  try {
    const tables = (
      await client.query(
        `select table_name from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE'
         order by table_name`,
      )
    ).rows.map((r) => r.table_name);
    const counts = new Map();
    for (const t of tables) {
      const { rows } = await client.query(`select count(*)::int as n from public."${t}"`);
      counts.set(t, rows[0].n);
    }
    return counts;
  } finally {
    await client.end();
  }
}

const source = process.env.SOURCE_URL?.trim();
const restore = process.env.RESTORE_URL?.trim();
if (!source || !restore) {
  console.error('✗ SOURCE_URL and RESTORE_URL are both required.');
  process.exit(1);
}

const a = await tableCounts(source);
const b = await tableCounts(restore);

let totalRows = 0;
const drift = [];
for (const [table, n] of a) {
  totalRows += n;
  const restored = b.get(table);
  if (restored !== n) drift.push(`${table}: source=${n} restored=${restored ?? 'MISSING'}`);
}
for (const table of b.keys()) {
  if (!a.has(table)) drift.push(`${table}: exists only in the restore`);
}

if (drift.length > 0) {
  console.error(`✗ restore drift in ${drift.length} table(s):\n  ${drift.join('\n  ')}`);
  process.exit(1);
}
if (totalRows === 0) {
  console.error('✗ source has zero rows — nothing was seeded, refusing to call this a restore test.');
  process.exit(1);
}
console.log(`✓ restore verified: ${a.size} tables, ${totalRows} rows, per-table counts identical.`);
