// Migration policy gate (gap register Vol 23 #25, Vol 8 §6). Policy decided 2026-07-09
// (docs/runbooks/data-lifecycle.md): the chain is FORWARD-ONLY — recovery is PITR/dump
// restore (backup-dr runbook) — but every NEW migration must carry a `-- @DOWN` section
// as the bad-deploy escape hatch (`migrate.mjs down` reverts the most recent one).
// Static checks, no database needed; runs in CI next to lint.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Migrations 0001–0136 predate the policy; @DOWN is required from 0137 onward.
const DOWN_REQUIRED_FROM = 137;

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'infrastructure', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const errors = [];
const byNumber = new Map();

for (const f of files) {
  const m = f.match(/^(\d{4})_[a-z0-9_]+\.sql$/);
  if (!m) {
    errors.push(`${f}: filename must match NNNN_snake_case.sql`);
    continue;
  }
  const n = Number(m[1]);
  if (byNumber.has(n)) errors.push(`${f}: duplicate number with ${byNumber.get(n)}`);
  byNumber.set(n, f);

  if (n >= DOWN_REQUIRED_FROM) {
    const sql = readFileSync(join(dir, f), 'utf8');
    if (!sql.includes('-- @DOWN')) {
      errors.push(`${f}: missing "-- @DOWN" section (required for migrations ≥ ${String(DOWN_REQUIRED_FROM).padStart(4, '0')})`);
    }
  }
}

// The chain must be gap-free: a skipped number usually means a lost or misnamed file.
const numbers = [...byNumber.keys()].sort((a, b) => a - b);
for (let i = 1; i < numbers.length; i++) {
  if (numbers[i] !== numbers[i - 1] + 1) {
    errors.push(`numbering gap between ${numbers[i - 1]} and ${numbers[i]}`);
  }
}

if (errors.length > 0) {
  console.error(`✗ migration policy violations (${errors.length}):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ migration policy: ${files.length} files, sequential, @DOWN present from ${DOWN_REQUIRED_FROM} on.`);
