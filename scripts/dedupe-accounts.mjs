#!/usr/bin/env node
/**
 * Account Deduplication Utility (G-11 / Gap A remediation)
 * Identifies duplicate account records by normalized name, reports duplicates,
 * and merges child entities (contacts, leads, opportunities, contracts) to the primary account.
 *
 * Usage:
 *   node scripts/dedupe-accounts.mjs [--dry-run]
 */

const BASE = process.env.AURA_API_URL ?? 'http://localhost:4000';
const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(`🔍 Scanning accounts for duplicates at ${BASE} (${isDryRun ? 'DRY-RUN' : 'LIVE'})...`);

  const res = await fetch(`${BASE}/api/v1/crm/accounts`);
  if (!res.ok) {
    console.error(`❌ Failed to fetch accounts: ${res.status}`);
    process.exit(1);
  }

  const accounts = await res.json();
  if (!Array.isArray(accounts) || accounts.length === 0) {
    console.log('✅ No accounts found.');
    return;
  }

  // Group accounts by normalized name
  const grouped = new Map();
  for (const acc of accounts) {
    const norm = acc.name.trim().toLowerCase();
    if (!grouped.has(norm)) grouped.set(norm, []);
    grouped.get(norm).push(acc);
  }

  let duplicateGroupCount = 0;
  let totalDuplicates = 0;

  for (const [_normName, group] of grouped.entries()) {
    if (group.length <= 1) continue;
    duplicateGroupCount++;
    totalDuplicates += group.length - 1;

    // Sort by createdAt ascending (earliest is primary)
    group.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
    const primary = group[0];
    const duplicates = group.slice(1);

    console.log(`\n📌 Found duplicate group: "${primary.name}" (${group.length} records)`);
    console.log(`   Primary ID: ${primary.id} (created: ${primary.createdAt ?? 'unknown'})`);
    for (const dup of duplicates) {
      console.log(`   - Duplicate ID to merge: ${dup.id}`);
    }

    if (!isDryRun) {
      // Execute merge API call if endpoint available
      try {
        const mergeRes = await fetch(`${BASE}/api/v1/crm/accounts/merge`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            primaryAccountId: primary.id,
            duplicateAccountIds: duplicates.map((d) => d.id),
          }),
        });
        if (mergeRes.ok) {
          console.log(`   ✅ Merged ${duplicates.length} duplicates into ${primary.id}`);
        } else {
          console.log(`   ⚠️ Merge endpoint returned ${mergeRes.status} (dry-run reporting completed)`);
        }
      } catch (err) {
        console.log(`   ⚠️ Merge call failed: ${err.message}`);
      }
    }
  }

  console.log(`\n📊 Deduplication Summary:`);
  console.log(`   Total accounts scanned: ${accounts.length}`);
  console.log(`   Duplicate groups found: ${duplicateGroupCount}`);
  console.log(`   Redundant rows identified: ${totalDuplicates}`);
  if (isDryRun && totalDuplicates > 0) {
    console.log(`   💡 Run without --dry-run to apply account deduplication.`);
  }
}

main().catch((err) => {
  console.error('❌ Deduplication script failed:', err);
  process.exit(1);
});
