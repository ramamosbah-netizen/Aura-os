// Generates the module-internals reference: per module — services with public
// methods, domain exports, and store ports with their methods.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
const OUT = join(ROOT, 'docs/master-report/vol-03b-module-internals.md');
const MODULES = join(ROOT, 'modules');

const publicMethods = (src) => {
  // methods inside the class body: `async name(` or `name(` at 2-space indent, not private/constructor
  const out = [];
  const re = /^ {2}(?:async\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s*(?:<[^>]*>)?\(/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    if (['constructor', 'if', 'for', 'while', 'switch', 'return', 'catch', 'private', 'get', 'set'].includes(name)) continue;
    const before = src.slice(Math.max(0, m.index - 12), m.index);
    if (/private\s*$/.test(before)) continue;
    if (!out.includes(name)) out.push(name);
  }
  return out;
};

const interfaceMethods = (src) => {
  const out = [];
  const ifaceRe = /export interface (\w+Store)\s*(?:extends [^{]+)?\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = ifaceRe.exec(src)) !== null) {
    const methods = [];
    const mm = m[2].matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9_]*)\s*(?:<[^>]*>)?\(/gm);
    for (const x of mm) if (!methods.includes(x[1])) methods.push(x[1]);
    out.push({ name: m[1], methods });
  }
  return out;
};

const domainExports = (dir) => {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    const names = [];
    for (const m of src.matchAll(/export (?:function|const) ([a-zA-Z0-9_]+)/g)) names.push(m[1]);
    for (const m of src.matchAll(/export (?:interface|type|enum) ([a-zA-Z0-9_]+)/g)) names.push(`~${m[1]}~`);
    if (names.length) out.push({ file: f, names });
  }
  return out;
};

let md = `# Volume 3B — Module Internals Reference

[← Volume 3](vol-03-module-catalog.md) · [← Master index](README.md)

Generated from \`modules/*/src\` on ${new Date().toISOString().slice(0, 10)} (regenerate:
\`node docs/master-report/tools/gen-internals.mjs <repo-root>\`). For each module: **services**
(public methods = the module's use-cases), **store ports** (persistence contract), and
**domain exports** (pure functions ~types in tildes~). This is the engineering map — Volume 3
is the business view of the same modules.

`;

const mods = readdirSync(MODULES).filter((m) => statSync(join(MODULES, m)).isDirectory()).sort();
let svcCount = 0, portCount = 0;

for (const mod of mods) {
  const src = join(MODULES, mod, 'src');
  if (!existsSync(src)) continue;
  md += `\n## ${mod}\n`;

  // services
  const files = readdirSync(src).filter((f) => f.endsWith('.service.ts'));
  if (files.length) md += `\n### Services\n\n| Service | Public methods |\n|---|---|\n`;
  for (const f of files.sort()) {
    const code = readFileSync(join(src, f), 'utf8');
    const cls = (code.match(/export class (\w+)/) || [])[1] ?? f;
    const methods = publicMethods(code);
    md += `| \`${cls}\` | ${methods.map((x) => `\`${x}\``).join(' · ') || '—'} |\n`;
    svcCount++;
  }

  // store ports
  const ports = readdirSync(src).filter((f) => /^[a-z0-9-]+-store\.ts$/.test(f) && !f.startsWith('in-memory') && !f.startsWith('postgres'));
  if (ports.length) md += `\n### Store ports\n\n| Port | Methods |\n|---|---|\n`;
  for (const f of ports.sort()) {
    const code = readFileSync(join(src, f), 'utf8');
    for (const iface of interfaceMethods(code)) {
      md += `| \`${iface.name}\` | ${iface.methods.map((x) => `\`${x}\``).join(' · ') || '—'} |\n`;
      portCount++;
    }
  }

  // domain
  const dom = domainExports(join(src, 'domain'));
  if (dom.length) {
    md += `\n### Domain (pure)\n\n| File | Exports |\n|---|---|\n`;
    for (const d of dom) md += `| \`domain/${d.file}\` | ${d.names.map((n) => n.startsWith('~') ? `*${n.replace(/~/g, '')}*` : `\`${n}\``).join(' · ')} |\n`;
  }
}

writeFileSync(OUT, md);
console.log(`modules=${mods.length} services=${svcCount} ports=${portCount} -> ${OUT}`);
