// Scaffold the next ADR safely — computes max+1 so a number collision is
// unrepresentable, writes the file from a template, and regenerates the
// registry. Usage: pnpm adr:new "Short decision title"
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ADR_DIR, REGISTRY, readAdrs, nextNumber, slugify, renderRegistry } from './adr-lib.mjs';

const title = process.argv.slice(2).join(' ').trim();
if (!title) {
  console.error('Usage: pnpm adr:new "Short decision title"');
  process.exit(1);
}

const { adrs, problems } = readAdrs();
if (problems.length) {
  console.error('✗ Existing ADRs have problems; fix them before adding a new one:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const num = nextNumber(adrs);
const file = `${num}-${slugify(title)}.md`;
const path = join(ADR_DIR, file);
if (existsSync(path)) {
  console.error(`✗ ${file} already exists.`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const body = `# ADR-${num}: ${title}

**Status:** Proposed · **Date:** ${today}

## Context
<!-- What forces are at play? Why is a decision needed now? -->

## Decision
<!-- The decision, stated plainly. -->

## Consequences
<!-- What becomes easier or harder? Trade-offs and follow-ups. -->
`;

writeFileSync(path, body);
// Regenerate the registry from the folder (now including the new file).
writeFileSync(REGISTRY, renderRegistry(readAdrs().adrs));

console.log(`✓ Created docs/adr/${file} (ADR-${num}) and updated the registry.`);
