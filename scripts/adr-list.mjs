// List every ADR with its status, links, and how many tracked files cite it
// (ADR-NNNN). A fast governance overview. Usage: pnpm adr:list
import { execSync } from 'node:child_process';
import { readAdrs } from './adr-lib.mjs';

const { adrs, problems } = readAdrs();
for (const p of problems) console.error(`! ${p}`);

function referencedBy(num) {
  try {
    const out = execSync(`git grep -l --fixed-strings "ADR-${num}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    // exclude the ADR's own file + the registry
    return out.split('\n').filter((f) => f && !f.includes(`/${num}-`) && !f.endsWith('adr/README.md')).length;
  } catch {
    return 0; // no matches (git grep exits 1) or git unavailable
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${adrs.length} ADRs\n`);
for (const a of adrs) {
  const links = [...a.supersedes.map((n) => `supersedes ${n}`), ...a.related.map((n) => `→${n}`)].join(', ');
  const refs = referencedBy(a.num);
  console.log(`${a.num}  ${pad(a.status, 11)} ${pad(a.category || '-', 13)} ${a.title}`);
  console.log(`      ${links ? `links: ${links}  ·  ` : ''}referenced by ${refs} file${refs === 1 ? '' : 's'}  ·  ${a.id}`);
}
