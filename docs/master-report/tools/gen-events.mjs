// Generates the event-flow reference: the catalog (with payload field hints),
// which services emit each event, and which subscribers consume it. Sourced
// from shared/src/events/catalog.ts, modules/*/src (emit sites), and
// apps/api/src/events (reactors/subscribers).
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
const OUT = join(ROOT, 'docs/master-report/vol-11a-event-reference.md');

// 1. catalog event names
const catalog = readFileSync(join(ROOT, 'shared/src/events/catalog.ts'), 'utf8');
const events = [...catalog.matchAll(/'([a-z]+\.[a-z_-]+\.[a-z_-]+)'/g)].map((m) => m[1]);
const uniq = [...new Set(events)].sort();

// 2. walk a tree collecting files (never descend into node_modules / dist — the
// workspace symlinks every package's deps back in, which would count the shared
// catalog as an emitter in every module)
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.turbo']);
const walk = (dir, pred) => {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, pred));
    else if (pred(e)) out.push(p);
  }
  return out;
};

// 3. emit sites: files under modules/ or apps/api referencing the literal
const moduleFiles = [
  ...walk(join(ROOT, 'modules'), (e) => e.endsWith('.ts') && !e.endsWith('.test.ts')),
  ...walk(join(ROOT, 'apps/api/src'), (e) => e.endsWith('.ts') && !e.endsWith('.test.ts')),
];
const fileText = new Map();
for (const f of moduleFiles) fileText.set(f, readFileSync(f, 'utf8'));

const rel = (f) => f.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '');
const shortRel = (f) => {
  const r = rel(f);
  const m = r.match(/(modules\/[^/]+|apps\/api\/src\/[^/]+)/);
  return m ? m[1].replace('apps/api/src/', 'api/') : r;
};

const emittersOf = (ev) => {
  const set = new Set();
  for (const [f, txt] of fileText) {
    // heuristic: a file that references the event and looks like it publishes
    if (txt.includes(`'${ev}'`) || txt.includes(`"${ev}"`) || txt.includes(`\`${ev}\``)) {
      if (rel(f).includes('/events/') && rel(f).includes('subscriber')) continue; // that's a consumer
      set.add(shortRel(f));
    }
  }
  return [...set];
};

// 4. consumers: the cross-module subscriber + any *subscriber*/reactor file
const subscriberFiles = walk(join(ROOT, 'apps/api/src/events'), (e) => e.endsWith('.ts') && !e.endsWith('.test.ts'));
const consumesOf = (ev) => {
  const set = new Set();
  for (const f of subscriberFiles) {
    const txt = readFileSync(f, 'utf8');
    if (txt.includes(`'${ev}'`) || txt.includes(`"${ev}"`)) set.add(rel(f).split('/').pop());
  }
  return [...set];
};

// group by context
const byContext = new Map();
for (const ev of uniq) {
  const ctx = ev.split('.')[0];
  if (!byContext.has(ctx)) byContext.set(ctx, []);
  byContext.get(ctx).push(ev);
}

let consumedCount = 0;
let md = `# Volume 11A — Event Flow Reference

[← Volume 11](vol-11-workflow-catalog.md) · [← Master index](README.md)

Generated on ${new Date().toISOString().slice(0, 10)} from \`shared/src/events/catalog.ts\`
(catalog), \`modules/*\` + \`apps/api/src\` (emit sites), and \`apps/api/src/events\`
(subscribers). Regenerate: \`node docs/master-report/tools/gen-events.mjs <repo-root>\`.

**${uniq.length} catalogued events** across ${byContext.size} contexts. "Emitters" are files
that reference the event literal at a write site; "Consumers" are reactor/subscriber files that
react to it. An event with no consumer is a **projection/webhook-only** signal (available to
external subscribers, not yet driving an internal reactor) — these are candidates for future
automation, flagged ⦿.

`;

for (const [ctx, evs] of [...byContext].sort()) {
  md += `\n## ${ctx} (${evs.length})\n\n| Event | Emitter(s) | Consumer reactor(s) |\n|---|---|---|\n`;
  for (const ev of evs) {
    const emitters = emittersOf(ev);
    const consumers = consumesOf(ev);
    if (consumers.length) consumedCount++;
    const flag = consumers.length ? '' : ' ⦿';
    md += `| \`${ev}\`${flag} | ${emitters.map((e) => `\`${e}\``).join(', ') || '—'} | ${consumers.map((c) => `\`${c}\``).join(', ') || '—'} |\n`;
  }
}

md = md.replace(
  '(available to\nexternal subscribers, not yet driving an internal reactor) — these are candidates for future\nautomation, flagged ⦿.',
  `(available to external subscribers, not yet driving an internal reactor) — these are candidates for future automation, flagged ⦿. **${consumedCount} of ${uniq.length}** events currently drive an internal reactor.`,
);

writeFileSync(OUT, md);
console.log(`events=${uniq.length} contexts=${byContext.size} with-consumer=${consumedCount} -> ${OUT}`);
