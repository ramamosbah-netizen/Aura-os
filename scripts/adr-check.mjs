// ADR registry integrity guard (CI). Treats ADRs as data and fails on any
// governance defect. `--write` regenerates the registry instead (bootstrap/fix).
// Usage: pnpm adr:check [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { REGISTRY, STATUSES, readAdrs, renderRegistry } from './adr-lib.mjs';

const write = process.argv.includes('--write');
const { adrs, problems } = readAdrs();

const byNum = new Map();
const byId = new Map();
const byTitle = new Map();
const nums = adrs.map((a) => a.num);

for (const a of adrs) {
  // duplicate number / id / title
  if (byNum.has(a.num)) problems.push(`duplicate number ${a.num}: ${byNum.get(a.num)} and ${a.file}`);
  else byNum.set(a.num, a.file);
  if (!a.id) problems.push(`${a.file}: missing id`);
  else if (byId.has(a.id)) problems.push(`duplicate id ${a.id}: ${byId.get(a.id)} and ${a.file}`);
  else byId.set(a.id, a.file);
  const tkey = a.title.toLowerCase();
  if (!a.title) problems.push(`${a.file}: missing title`);
  else if (byTitle.has(tkey)) problems.push(`duplicate title "${a.title}": ${byTitle.get(tkey)} and ${a.file}`);
  else byTitle.set(tkey, a.file);

  // status present + valid
  if (!a.status) problems.push(`${a.file}: missing status`);
  else if (!STATUSES.includes(a.status)) problems.push(`${a.file}: invalid status "${a.status}" (allow: ${STATUSES.join(', ')})`);

  // related / supersedes must resolve to real ADRs (and not self)
  for (const kind of ['related', 'supersedes']) {
    for (const ref of a[kind]) {
      if (ref === a.num) problems.push(`${a.file}: ${kind} references itself (${ref})`);
      else if (!nums.includes(ref)) problems.push(`${a.file}: ${kind} references missing ADR ${ref}`);
    }
  }
}

// numbers must be a gap-free, ordered sequence from 0001 (catches manual mistakes)
adrs.forEach((a, i) => {
  const expected = String(i + 1).padStart(4, '0');
  if (a.num !== expected) problems.push(`ordering: expected ${expected} at position ${i + 1}, found ${a.num} (${a.file})`);
});

if (problems.length) {
  console.error('✗ ADR integrity problems:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const expected = renderRegistry(adrs);
if (write) {
  writeFileSync(REGISTRY, expected);
  console.log(`✓ Wrote docs/adr/README.md (${adrs.length} ADRs).`);
  process.exit(0);
}

let actual = '';
try { actual = readFileSync(REGISTRY, 'utf8'); } catch { /* missing */ }
if (actual.trim() !== expected.trim()) {
  console.error('✗ docs/adr/README.md is out of date with the ADR folder.');
  console.error('  Run `pnpm adr:check --write` (or add ADRs via `pnpm adr:new`) and commit.');
  process.exit(1);
}

console.log(`✓ ADR registry consistent (${adrs.length} ADRs; ids, titles, statuses, links & ordering all valid).`);
