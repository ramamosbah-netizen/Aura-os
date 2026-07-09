// Cross-context orphan scan (gap register Vol 23 #25, Vol 8 §5). The schema keeps only
// one hard FK by design (snapshot-not-join, ADR-0001) — referential integrity rests on
// service code + events. This scan is the mitigation: it checks every catalogued
// cross-context reference for ids that no longer resolve, tenant-scoped.
//
//   DATABASE_URL=... node scripts/orphan-scan.mjs            # report only
//   DATABASE_URL=... node scripts/orphan-scan.mjs --enforce  # non-zero exit on any orphan
//
// Run cadence: CI (post-seed, enforced) + monthly against production (see
// docs/runbooks/data-lifecycle.md). Extend REFERENCES as new cross-context ids appear.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: join(here, '..', '.env.local') });

// child table . column  →  parent table (id), both tenant-scoped.
const REFERENCES = [
  ['aura_tendering_tenders', 'account_id', 'aura_crm_accounts'],
  ['aura_crm_opportunities', 'account_id', 'aura_crm_accounts'],
  ['aura_contracts_contracts', 'tender_id', 'aura_tendering_tenders'],
  ['aura_contracts_contracts', 'account_id', 'aura_crm_accounts'],
  ['aura_projects_projects', 'contract_id', 'aura_contracts_contracts'],
  ['aura_projects_projects', 'account_id', 'aura_crm_accounts'],
  ['aura_procurement_purchase_orders', 'project_id', 'aura_projects_projects'],
  ['aura_finance_invoices', 'po_id', 'aura_procurement_purchase_orders'],
  ['aura_finance_invoices', 'project_id', 'aura_projects_projects'],
  ['aura_inventory_grns', 'po_id', 'aura_procurement_purchase_orders'],
  ['aura_inventory_grns', 'project_id', 'aura_projects_projects'],
];

const envOrFile = (name) => {
  const file = process.env[`${name}_FILE`]?.trim();
  if (file) return readFileSync(file, 'utf8').trim() || null;
  return process.env[name]?.trim() || null;
};

const url = envOrFile('DATABASE_URL');
if (!url) {
  console.error('✗ DATABASE_URL is not set — cannot scan.');
  process.exit(1);
}
const sslOff = /(@|\/\/)(localhost|127\.0\.0\.1)/.test(url) || /[?&]sslmode=disable/.test(url);
const client = new pg.Client({ connectionString: url, ssl: sslOff ? false : { rejectUnauthorized: false } });

const enforce = process.argv.includes('--enforce');

async function main() {
  await client.connect();
  let orphanTotal = 0;
  let scanned = 0;
  for (const [child, column, parent] of REFERENCES) {
    // Skip pairs whose tables don't exist in this database (partial deployments).
    const exists = await client.query(
      `select count(*)::int as n from information_schema.tables
       where table_schema = 'public' and table_name = any($1)`,
      [[child, parent]],
    );
    if (exists.rows[0].n !== 2) {
      console.log(`• skip  ${child}.${column} → ${parent} (table missing)`);
      continue;
    }
    const { rows } = await client.query(
      `select count(*)::int as n
       from public.${child} c
       where c.${column} is not null
         and not exists (
           select 1 from public.${parent} p
           where p.id = c.${column} and p.tenant_id = c.tenant_id
         )`,
    );
    scanned += 1;
    const n = rows[0].n;
    orphanTotal += n;
    console.log(`${n === 0 ? '✓' : '✗'} ${child}.${column} → ${parent}: ${n} orphan(s)`);
  }
  console.log(`\nOrphan scan: ${scanned} reference(s) checked, ${orphanTotal} orphan(s).`);
  if (orphanTotal > 0 && enforce) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(`\n✗ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => client.end());
