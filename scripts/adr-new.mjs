// Scaffold the next ADR safely as DATA — computes max+1 (collision is
// unrepresentable), mints a stable id, writes frontmatter + a template body,
// and regenerates the registry. Non-interactive by design so it works in CI
// and scripts. Usage:
//   pnpm adr:new "Short title" [--status Draft] [--category Platform]
//        [--owner Architecture] [--related 0004,0010] [--supersedes 0009]
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADR_DIR, REGISTRY, STATUSES, readAdrs, nextNumber, slugify, newAdrId,
  renderFrontmatter, renderRegistry,
} from './adr-lib.mjs';

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i] ?? '';
    else positional.push(argv[i]);
  }
  return { title: positional.join(' ').trim(), flags };
}

const { title, flags } = parseArgs(process.argv.slice(2));
if (!title) {
  console.error('Usage: pnpm adr:new "Short title" [--status] [--category] [--owner] [--related a,b] [--supersedes a,b]');
  process.exit(1);
}

const status = flags.status ?? 'Draft';
if (!STATUSES.includes(status)) {
  console.error(`✗ Invalid --status "${status}". One of: ${STATUSES.join(', ')}`);
  process.exit(1);
}

const { adrs, problems } = readAdrs();
if (problems.length) {
  console.error('✗ Existing ADRs have problems; fix them before adding a new one:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const num = nextNumber(adrs);
const file = `${num}-${slugify(title)}.md`;
const path = join(ADR_DIR, file);
if (existsSync(path)) {
  console.error(`✗ ${file} already exists.`);
  process.exit(1);
}

const known = new Set(adrs.map((a) => a.num));
for (const ref of [...list(flags.related), ...list(flags.supersedes)]) {
  if (!known.has(ref)) {
    console.error(`✗ --related/--supersedes references ADR ${ref}, which does not exist.`);
    process.exit(1);
  }
}

const record = {
  id: newAdrId(),
  num,
  title,
  status,
  category: flags.category ?? '',
  owner: flags.owner ?? '',
  date: new Date().toISOString().slice(0, 10),
  supersedes: list(flags.supersedes),
  related: list(flags.related),
};

const body = `${renderFrontmatter(record)}

# ADR-${num}: ${title}

**Status:** ${status} · **Date:** ${record.date}

## Context
<!-- What forces are at play? Why is a decision needed now? -->

## Decision
<!-- The decision, stated plainly. -->

## Consequences
<!-- What becomes easier or harder? Trade-offs and follow-ups. -->
`;

writeFileSync(path, body);
writeFileSync(REGISTRY, renderRegistry(readAdrs().adrs)); // regenerate from folder
console.log(`✓ Created docs/adr/${file} (ADR-${num}, ${record.id}) and updated the registry.`);
