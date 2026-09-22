import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * EVERY `INSERT` MUST TARGET AS MANY COLUMNS AS IT SUPPLIES EXPRESSIONS.
 *
 * Three hand-kept INSERTs have shipped out of step, and TypeScript can see none of it: the column
 * list is text inside a template literal, the `$n` run is text in the same literal, and the values
 * are a separate array. Nothing relates the three.
 *
 *   submittal            19 columns, 17 placeholders   (wave C, caught in review)
 *   project              39 columns, 36 placeholders   (wave E, caught in review)
 *   O&M item             19 columns, 20 placeholders   ┐
 *   handover spare       19 columns, 20 placeholders   │ waves D and F — NOT caught in review.
 *   asset inspection     10 columns, 12 placeholders   │ Found only when a browser suite ran
 *   fleet fuel log       10 columns, 12 placeholders   │ against Postgres and the API answered
 *   site plant usage     17 columns, 20 placeholders   ┘ 500 on the first write of each.
 *
 * The last five were invisible everywhere it was cheap to look. The in-memory tier executes no
 * SQL, so unit and API e2e tests pass; the modules had no pg-int test; and a store whose every
 * write throws still type-checks, lints and builds. Only a real database says anything.
 *
 * So the check is textual and runs everywhere, in milliseconds, with no database at all.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const ROOTS = ['modules', 'core', 'intelligence', join('apps', 'api', 'src')].map((p) => join(repo, p));

const SKIP_DIR = new Set(['node_modules', 'dist', '.turbo', '.next']);

/**
 * ONE walk of the repository, shared.
 *
 * Both checks below read every store in the monorepo. Walking twice put this file over vitest's
 * 5s default under turbo's parallel load — a TIMEOUT, not an assertion, which is the failure
 * shape that reads as a regression and is not one. The permission-vocabulary guard was memoised
 * for the same reason; this follows it rather than raising a timeout, because a budget raised to
 * fit the slowest run stops being a budget.
 */
let cachedSources: Array<{ file: string; src: string }> | null = null;
function sources(): Array<{ file: string; src: string }> {
  if (cachedSources) return cachedSources;
  cachedSources = ROOTS.flatMap((root) => tsFiles(root))
    .map((file) => ({ file, src: readFileSync(file, 'utf8') }))
    .filter(({ src }) => /insert\s+into/i.test(src));
  return cachedSources;
}

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

const INSERT = /insert\s+into\s+[\w."]+\s*\(\s*([^)]*?)\)\s*values\s*\(\s*(\$\d+(?:\s*,\s*\$\d+)*)\s*\)/gis;

/**
 * …and the same statement's `ON CONFLICT DO UPDATE SET x = excluded.y`.
 *
 * `excluded` is the row the statement TRIED to insert, so naming a column the insert does not
 * supply is never meaningful — and when the table has no such column Postgres refuses the whole
 * statement, so every write through that path fails. Wave F pasted maintenance provenance
 * (completed_by / completed_at) into two tables that have neither, and both `aura_assets` and
 * `aura_fleet_vehicles` answered 500 on their very first create.
 */
const CONFLICT = /insert\s+into\s+([\w."]+)\s*\(\s*([^)]*?)\)\s*values\s*\([^)]*\)\s*(on\s+conflict[\s\S]*?)(?=`)/gi;

interface Mismatch { file: string; line: number; detail: string }

function scan(): { mismatches: Mismatch[]; statements: number } {
  const mismatches: Mismatch[] = [];
  let statements = 0;
  for (const { file, src } of sources()) {
    for (const m of src.matchAll(INSERT)) {
        // `${COLS}` means the column list lives in one shared constant — the pattern that cannot
        // drift, and one this text scan has no way to count. Left to the stores that use it.
        const colsRaw = m[1].replace(/--[^\n]*/g, '');
        if (colsRaw.includes('${')) continue;
        statements += 1;
        const cols = colsRaw.split(',').map((c) => c.trim()).filter(Boolean);
        const nums = [...m[2].matchAll(/\$(\d+)/g)].map((x) => Number(x[1]));
        const line = src.slice(0, m.index).split('\n').length;
        const rel = file.slice(repo.length + 1).replace(/\\/g, '/');
        if (cols.length !== nums.length) {
          mismatches.push({ file: rel, line, detail: `${cols.length} columns but ${nums.length} placeholders` });
          continue;
        }
        // The SET must be exactly {1..n}; the ORDER must not. A column added later can legally
        // take the last parameter without renumbering every one after it — the responsibilities
        // insert puts $22 in its fifth slot on purpose, and that statement is correct.
        const distinct = new Set(nums);
        if (distinct.size !== nums.length || [...distinct].some((n) => n < 1 || n > nums.length)) {
          mismatches.push({
            file: rel,
            line,
            detail: `placeholders are not the set $1..$${nums.length} (saw ${nums.map((n) => `$${n}`).join(',')})`,
          });
        }
    }
  }
  return { mismatches, statements };
}

function scanExcluded(): Mismatch[] {
  const bad: Mismatch[] = [];
  for (const { file, src } of sources()) {
    if (!src.includes('excluded.')) continue;
    for (const m of src.matchAll(CONFLICT)) {
        const colsRaw = m[2].replace(/--[^\n]*/g, '');
        if (colsRaw.includes('${')) continue;
        const cols = new Set(
          colsRaw.split(',').map((c) => c.trim().replace(/"/g, '').toLowerCase()).filter(Boolean),
        );
        const conflict = m[3].replace(/--[^\n]*/g, '');
        const refs = new Set([...conflict.matchAll(/excluded\.(\w+)/gi)].map((r) => r[1].toLowerCase()));
        for (const ref of refs) {
          if (!cols.has(ref)) {
            const line = src.slice(0, m.index).split('\n').length;
            bad.push({
              file: file.slice(repo.length + 1).replace(/\\/g, '/'),
              line,
              detail: `${m[1]} sets from excluded.${ref}, a column this INSERT does not supply`,
            });
          }
        }
    }
  }
  return bad;
}

describe('hand-written INSERT statements', () => {
  const { mismatches, statements } = scan();

  it('finds statements to check — otherwise this file passes over an empty list', () => {
    // Every one of the seven bugs above would have been missed by a scan that silently matched
    // nothing, and a green test over zero rows is the failure mode this guard exists to avoid.
    expect(statements).toBeGreaterThan(50);
  });

  it('target as many columns as they supply values', () => {
    const report = mismatches.map((m) => `${m.file}:${m.line} — ${m.detail}`);
    expect(report, `an INSERT cannot run at all when these disagree:\n  ${report.join('\n  ')}`).toEqual([]);
  });

  it('only read `excluded` columns they actually insert', () => {
    const report = scanExcluded().map((m) => `${m.file}:${m.line} — ${m.detail}`);
    expect(report, `Postgres refuses the whole statement when this is wrong:\n  ${report.join('\n  ')}`).toEqual([]);
  });
});
