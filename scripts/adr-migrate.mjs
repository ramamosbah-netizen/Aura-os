// One-off (idempotent): add YAML frontmatter to any ADR that lacks it, so the
// folder becomes data. Infers number (filename), title/status/date (body), mints
// a stable id, and applies a small known category/relation map. Safe to re-run:
// files that already have frontmatter are skipped. Usage: node scripts/adr-migrate.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ADR_DIR, newAdrId, renderFrontmatter } from './adr-lib.mjs';

// Curated metadata for the existing decisions (category + known cross-references).
const META = {
  '0001': { category: 'Architecture' },
  '0002': { category: 'Platform' },
  '0003': { category: 'Platform' },
  '0004': { category: 'Architecture' },
  '0005': { category: 'AI' },
  '0006': { category: 'Platform' },
  '0007': { category: 'Platform' },
  '0008': { category: 'Platform', related: ['0006'] },
  '0009': { category: 'Architecture' },
  '0010': { category: 'Security' },
  '0011': { category: 'Architecture', related: ['0004', '0006', '0010', '0012'] },
  '0012': { category: 'Architecture', related: ['0011', '0002', '0010'] },
  '0013': { category: 'Platform' },
  '0014': { category: 'UI' },
  '0015': { category: 'Domain' },
  '0016': { category: 'Platform' },
};

const FILE_RE = /^(\d{4})-.+\.md$/;
let migrated = 0;

for (const file of readdirSync(ADR_DIR).filter((f) => FILE_RE.test(f)).sort()) {
  const path = join(ADR_DIR, file);
  const text = readFileSync(path, 'utf8');
  if (text.startsWith('---\n')) continue; // already has frontmatter

  const num = file.match(FILE_RE)[1];
  const title = text.match(/^#\s*ADR-\d{4}\s*[—:-]\s*(.+?)\s*$/m)?.[1]?.trim() ?? file;
  const status = text.match(/\*\*Status:\*\*\s*([A-Za-z]+)/)?.[1] ?? 'Accepted';
  const dateM = text.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})|\((\d{4}-\d{2}-\d{2})\)/);
  const date = dateM ? dateM[1] ?? dateM[2] : '';
  const meta = META[num] ?? {};

  const fm = renderFrontmatter({
    id: newAdrId(),
    num,
    title,
    status,
    category: meta.category ?? '',
    owner: 'Architecture',
    date,
    supersedes: meta.supersedes ?? [],
    related: meta.related ?? [],
  });

  writeFileSync(path, `${fm}\n\n${text}`);
  migrated++;
  console.log(`  + frontmatter → ${file}`);
}

console.log(migrated ? `✓ Migrated ${migrated} ADR(s).` : '✓ Nothing to migrate (all have frontmatter).');
