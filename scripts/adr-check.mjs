// ADR registry integrity guard (CI). Fails if any ADR has a duplicate number,
// a heading/filename mismatch, or if the committed registry has drifted from
// the folder. `--write` regenerates the registry instead of checking (used to
// bootstrap or fix drift locally). Usage: pnpm adr:check [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { REGISTRY, readAdrs, renderRegistry } from './adr-lib.mjs';

const write = process.argv.includes('--write');
const { adrs, problems } = readAdrs();

// Duplicate numbers → the exact class of error this tooling exists to prevent.
const seen = new Map();
for (const a of adrs) {
  if (seen.has(a.num)) problems.push(`duplicate ADR number ${a.num}: ${seen.get(a.num)} and ${a.file}`);
  else seen.set(a.num, a.file);
}

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

const actual = (() => {
  try {
    return readFileSync(REGISTRY, 'utf8');
  } catch {
    return '';
  }
})();

if (actual.trim() !== expected.trim()) {
  console.error('✗ docs/adr/README.md is out of date with the ADR folder.');
  console.error("  Run `pnpm adr:check --write` (or add ADRs via `pnpm adr:new`) and commit.");
  process.exit(1);
}

console.log(`✓ ADR registry is consistent (${adrs.length} ADRs, no collisions).`);
