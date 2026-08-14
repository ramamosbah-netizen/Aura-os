import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Money-rounding fitness test (G-10, Phase 2a).
 *
 * The `Math.round(n * 100) / 100` idiom (in any scale — *10/10, *1000/1000, *10000/10000) is
 * float-unsafe: it mis-rounds on the boundary (`Math.round(1.005 * 100) / 100 === 1.00`, should be
 * 1.01) and cannot recover an already-inexact product (`0.70 * 0.05 === 0.03499…`). It computed the
 * wrong VAT cent on 1,638 real prices (see docs/reports/2026-08-14-g10-money-model-map.md).
 *
 * Phase 2a removed every occurrence in favour of the exact big.js money policy in
 * `shared/src/money.ts` — `roundMoney`/`moneyNumber` (money), `mulMoney`/`vatOf`/`convertMoney`
 * (products), `roundDecimal` (non-money hours/days). This test is the permanent regression guard:
 * a new occurrence in modules/* or apps/api fails CI. Fix it by using the money util, never by
 * adding to an allowlist (there is deliberately none).
 */

const REPO = resolve(__dirname, '../../..');

// Matches the decimal-scaling idiom `Math.round(<expr> * N) / N` for N in {10,100,1000,10000}.
// The backreference \1 requires the same scale on both sides, so `Math.round(x / MS_DAY)` and
// `Math.round(mins / 60)` (no `* N ) / N`) do not match.
const IDIOM = /Math\.round\([^;\n]*\*\s*(10|100|1000|10000)\s*\)\s*\/\s*\1\b/;

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

describe('Money rounding — the float-unsafe Math.round(n*100)/100 idiom is banned (G-10)', () => {
  it('finds no decimal-scaling round idiom in modules/* or apps/api', () => {
    const roots = [join(REPO, 'apps', 'api', 'src')];
    for (const name of readdirSync(join(REPO, 'modules'))) roots.push(join(REPO, 'modules', name, 'src'));

    const hits: string[] = [];
    for (const root of roots) {
      for (const file of tsFiles(root)) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (IDIOM.test(line)) hits.push(`  ${file.replace(REPO, '')}:${i + 1}  ${line.trim()}`);
        });
      }
    }

    expect(
      hits.sort(),
      'use the money util (shared/src/money.ts): moneyNumber / mulMoney / vatOf / convertMoney, or roundDecimal for non-money',
    ).toEqual([]);
  });

  it('detects the idiom pattern it is meant to catch', () => {
    expect(IDIOM.test('const x = Math.round(n * 100) / 100;')).toBe(true);
    expect(IDIOM.test('Math.round(qty * rate * 100) / 100')).toBe(true);
    expect(IDIOM.test('Math.round(n * 10000) / 10000')).toBe(true);
    // legitimate non-scaling rounds must NOT trip it
    expect(IDIOM.test('Math.round(diff / MS_DAY)')).toBe(false);
    expect(IDIOM.test('Math.round(mins / 60)')).toBe(false);
    expect(IDIOM.test('moneyNumber(n)')).toBe(false);
  });
});
