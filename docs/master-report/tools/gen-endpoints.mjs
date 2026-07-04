// Generates the full API endpoint reference from controller sources.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
const SRC = join(ROOT, 'apps/api/src');
const OUT = join(ROOT, 'docs/master-report/vol-09a-endpoint-reference.md');

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.controller.ts')) files.push(p);
  }
})(SRC);
files.sort();

const rows = new Map(); // area -> [{method, path, handler}]
let total = 0;

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const area = f.slice(SRC.length + 1).split(/[\\/]/)[0];
  const ctrlMatch = src.match(/@Controller\(\s*'([^']*)'\s*\)/);
  const base = ctrlMatch ? ctrlMatch[1] : '';
  const re = /@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)[\s\S]*?(?:async\s+)?([A-Za-z0-9_]+)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const method = m[1].toUpperCase();
    const sub = m[2] ?? '';
    const path = ('/' + [base, sub].filter(Boolean).join('/')).replace(/\/+/g, '/');
    const full = `/api/v1${path === '/' ? '' : path}`;
    if (!rows.has(area)) rows.set(area, []);
    rows.get(area).push({ method, path: full, handler: m[3], file: f.slice(ROOT.length + 1).replace(/\\/g, '/') });
    total++;
  }
}

const areas = [...rows.keys()].sort();
let md = `# Volume 9A — Full Endpoint Reference

[← Volume 9](vol-09-api.md) · [← Master index](README.md)

Generated from controller sources on ${new Date().toISOString().slice(0, 10)} — **${total} handlers across ${areas.length} areas**. Regenerate with \`docs/master-report/tools/gen-endpoints.mjs; do not hand-edit rows.

`;
const order = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
for (const area of areas) {
  const list = rows.get(area);
  list.sort((a, b) => a.path.localeCompare(b.path) || order[a.method] - order[b.method]);
  md += `\n## ${area} (${list.length})\n\n| Method | Path | Handler |\n|---|---|---|\n`;
  for (const r of list) md += `| ${r.method} | \`${r.path}\` | \`${r.handler}\` |\n`;
}
writeFileSync(OUT, md);
console.log(`areas=${areas.length} handlers=${total} -> ${OUT}`);
