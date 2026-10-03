import { describe, it, expect, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Paged-order fitness test (PAGE-ORDER-01).
 *
 * Offset paging is only as sound as the order under it. A query that pages with
 * `ORDER BY created_at DESC LIMIT $n OFFSET $m` gives rows that tie on created_at — every row one
 * INSERT writes shares its now() — no fixed order between page queries, so one page can repeat a row
 * the last page showed and a row can be shown by no page at all. Measured on PostgreSQL: 5,200 rows
 * written by one statement, paged 1,000 at a time, came back as 5,200 rows but 5,199 distinct.
 *
 * So every ORDER BY that a query pages with OFFSET must END in a unique key — the table's `id` (every
 * table paged this way keys on it), or a dynamic clause passed through `withUniqueTieBreak` from
 * @aura/shared, which appends it. Fix a failure by adding `, id <same direction>` to the clause,
 * never by an allowlist (there is deliberately none).
 *
 * In-memory stores are NOT held to this: they sort a Map in insertion order, so their pages are
 * already consistent, and breaking their ties by a random UUID would make rows created in the same
 * millisecond come back in a different order on every run.
 */

const REPO = resolve(__dirname, '../../..');

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.turbo' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.e2e-spec.ts')) out.push(p);
  }
  return out;
}

interface PagedOrder { file: string; clause: string; sound: boolean }

/** Every ORDER BY in a SQL template that is followed by OFFSET, with whether its last key is unique. */
function pagedOrders(file: string, source: string): PagedOrder[] {
  const found: PagedOrder[] = [];
  const parts = source.split('`');
  for (let i = 1; i < parts.length; i += 2) {
    // Interpolations become placeholders, so a `${…}` is one opaque token to the parse below.
    const exprs: string[] = [];
    const sql = parts[i].replace(/\$\{([^{}]*)\}/g, (_m, expr: string) => `__EXPR${exprs.push(expr.trim()) - 1}__`);
    const re = /ORDER\s+BY\s+([\s\S]*?)\s+(LIMIT|OFFSET)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      const clause = m[1];
      // A clause that closes a parenthesis belongs to a window or a subquery, not to this statement.
      if ((clause.match(/\(/g) ?? []).length < (clause.match(/\)/g) ?? []).length) continue;
      const rest = sql.slice(m.index + m[0].length - m[2].length).split(';')[0];
      if (!/\bOFFSET\b/i.test(rest)) continue;
      const keys = clause.split(',').map((k) => k.trim());
      const last = keys[keys.length - 1].replace(/\s+(asc|desc)\b[\s\S]*$/i, '').replace(/\s+nulls\s+(first|last)$/i, '').trim();
      const expr = /^__EXPR(\d+)__$/.exec(last);
      const sound = expr
        ? /^withUniqueTieBreak\(/.test(exprs[Number(expr[1])])
        : /^([a-z_]+\.)?id$/i.test(last);
      found.push({ file, clause: clause.replace(/__EXPR(\d+)__/g, (_x, n: string) => `\${${exprs[Number(n)]}}`).replace(/\s+/g, ' ').trim(), sound });
    }
  }
  return found;
}

// An I/O-bound walk of the repository; the budget names what it is (see money-rounding.fitness).
vi.setConfig({ testTimeout: 30_000 });

describe('Paged order — every ORDER BY paged with OFFSET ends in a unique key (PAGE-ORDER-01)', () => {
  it('reads a tied sort key as unsound and a trailing id or tie-break helper as sound', () => {
    const verdicts = pagedOrders('probe.ts', [
      'q(`SELECT * FROM t ORDER BY created_at DESC LIMIT $1 OFFSET $2`)',
      'q(`SELECT * FROM t ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`)',
      'q(`select * from t order by date desc, t.id desc limit $1 offset $2`)',
      'q(`SELECT * FROM t ORDER BY ${withUniqueTieBreak(o)} LIMIT $1 OFFSET $2`)',
      'q(`SELECT * FROM t ORDER BY ${o} LIMIT $1 OFFSET $2`)',
      'q(`SELECT * FROM t ORDER BY name ASC LIMIT $1`)',
      'q(`SELECT *, row_number() OVER (ORDER BY created_at) FROM t LIMIT $1 OFFSET $2`)',
    ].join('\n')).map((v) => v.sound);
    // The LIMIT-only list and the window's ORDER BY are not paged by this statement's OFFSET.
    expect(verdicts).toEqual([false, true, true, true, false]);
  });

  it('finds no paged ORDER BY whose last key is not unique in modules/*, core or apps/api', () => {
    const roots = [join(REPO, 'apps', 'api', 'src'), join(REPO, 'core', 'src')];
    for (const name of readdirSync(join(REPO, 'modules'))) roots.push(join(REPO, 'modules', name, 'src'));

    const all: PagedOrder[] = [];
    for (const root of roots) {
      for (const file of tsFiles(root)) all.push(...pagedOrders(file.replace(REPO, ''), readFileSync(file, 'utf8')));
    }
    // It reads what it guards: the paged stores are found at all, the helpers among them.
    expect(all.length, 'the scan found the paged queries').toBeGreaterThan(50);
    expect(all.filter((o) => o.clause.includes('withUniqueTieBreak')).length, 'the shared paging helpers').toBeGreaterThanOrEqual(2);

    const unsound = all.filter((o) => !o.sound).map((o) => `  ${o.file}  ORDER BY ${o.clause}`);
    expect(
      unsound,
      `These queries page with OFFSET over an order whose last key can tie, so a page can repeat one row and skip another. ` +
        `End each ORDER BY with the table's unique key (", id DESC" / ", id ASC" in the same direction), or pass a dynamic clause through withUniqueTieBreak:\n${unsound.join('\n')}`,
    ).toEqual([]);
  });
});
