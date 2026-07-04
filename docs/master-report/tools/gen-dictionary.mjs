// Generates the table-by-table data dictionary from SQL migrations:
// CREATE TABLE columns + later ALTER TABLE ADD COLUMN, with source migrations.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
const MIG = join(ROOT, 'infrastructure/migrations');
const OUT = join(ROOT, 'docs/master-report/vol-08a-data-dictionary.md');

const tables = new Map(); // name -> { created, columns: [{name, def, from}], alters: [] , rls, indexes: n }

const migFiles = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
for (const f of migFiles) {
  const sql = readFileSync(join(MIG, f), 'utf8');
  const num = f.slice(0, 4);

  // CREATE TABLE blocks
  const createRe = /create table if not exists\s+(?:public\.)?(aura_[a-z0-9_]+)\s*\(([\s\S]*?)\n\);/gi;
  let m;
  while ((m = createRe.exec(sql)) !== null) {
    const name = m[1].toLowerCase();
    if (!tables.has(name)) tables.set(name, { created: num, columns: [], rls: false, indexes: 0 });
    const t = tables.get(name);
    const body = m[2];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim().replace(/,\s*$/, '');
      if (!line || line.startsWith('--')) continue;
      const cm = line.match(/^([a-z0-9_]+)\s+(.+)$/i);
      if (!cm) continue;
      const col = cm[1].toLowerCase();
      if (['primary', 'unique', 'check', 'constraint', 'foreign'].includes(col)) {
        t.columns.push({ name: `*${col}*`, def: cm[2].replace(/\|/g, '\\|'), from: num, constraint: true });
        continue;
      }
      t.columns.push({ name: col, def: cm[2].replace(/\|/g, '\\|'), from: num });
    }
  }

  // ALTER TABLE ADD COLUMN
  const alterRe = /alter table\s+(?:if exists\s+)?(?:public\.)?(aura_[a-z0-9_]+)\s+add column\s+(?:if not exists\s+)?([a-z0-9_]+)\s+([^;]+);/gi;
  while ((m = alterRe.exec(sql)) !== null) {
    const name = m[1].toLowerCase();
    if (!tables.has(name)) tables.set(name, { created: num, columns: [], rls: false, indexes: 0 });
    tables.get(name).columns.push({ name: m[2].toLowerCase(), def: m[3].trim().replace(/\|/g, '\\|'), from: num, added: true });
  }

  // RLS + indexes
  const rlsRe = /alter table\s+(?:public\.)?(aura_[a-z0-9_]+)\s+enable row level security/gi;
  while ((m = rlsRe.exec(sql)) !== null) {
    const name = m[1].toLowerCase();
    if (tables.has(name)) tables.get(name).rls = true;
  }
  const idxRe = /create (?:unique )?index if not exists\s+\S+\s+on\s+(?:public\.)?(aura_[a-z0-9_]+)/gi;
  while ((m = idxRe.exec(sql)) !== null) {
    const name = m[1].toLowerCase();
    if (tables.has(name)) tables.get(name).indexes++;
  }
}

// group by module prefix
const groups = new Map();
for (const [name, t] of tables) {
  const parts = name.replace(/^aura_/, '').split('_');
  const known = ['crm','tendering','contracts','projects','procurement','inventory','finance','subcontracts','engineering','doccontrol','site','hse','quality','hr','fleet','assets','asset','amc','kernel','workflow','webhook','ai','pricing','builder','approval','calendar','document','documents','vector','autonomy'];
  const g = known.includes(parts[0]) ? parts[0] : 'kernel-misc';
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push([name, t]);
}

const totalCols = [...tables.values()].reduce((s, t) => s + t.columns.filter((c) => !c.constraint).length, 0);
let md = `# Volume 8A — Data Dictionary

[← Volume 8](vol-08-database.md) · [← Master index](README.md)

Generated from \`infrastructure/migrations/0001–${migFiles[migFiles.length - 1].slice(0, 4)}\` on ${new Date().toISOString().slice(0, 10)} — **${tables.size} tables · ${totalCols} columns**. Columns marked ➕ were added by a later migration; *italic* rows are table-level constraints. RLS = row-level security enabled at creation.

`;

const groupOrder = [...groups.keys()].sort();
for (const g of groupOrder) {
  const list = groups.get(g).sort((a, b) => a[0].localeCompare(b[0]));
  md += `\n## ${g} (${list.length} tables)\n`;
  for (const [name, t] of list) {
    md += `\n### \`${name}\`\n\nCreated in \`${t.created}\` · ${t.indexes} index(es) · RLS ${t.rls ? '✅' : '—'}\n\n| Column | Definition | Migration |\n|---|---|---|\n`;
    for (const c of t.columns) {
      md += `| ${c.constraint ? `*${c.name.replace(/\*/g, '')}*` : `\`${c.name}\``}${c.added ? ' ➕' : ''} | ${c.def} | ${c.from} |\n`;
    }
  }
}
writeFileSync(OUT, md);
console.log(`tables=${tables.size} cols=${totalCols} -> ${OUT}`);
