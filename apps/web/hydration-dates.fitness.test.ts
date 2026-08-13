import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Hydration-safe date formatting (regression gate for PR #213).
 *
 * A client component formats a date twice — once on the server, once again in the browser — and
 * React compares the two strings. When they differ it throws the entire subtree away and
 * re-renders it, logging an uncaught "Hydration failed". The nodes present at load are discarded
 * and replaced, which is also a plausible source of E2E flake.
 *
 * Two independent ways to differ, and a bare call has both:
 *   locale   — Node resolves en-AE (13/08/2026); a browser on en-US renders 8/13/2026.
 *   timezone — each side formats in its own zone, so a viewer a day ahead or behind the server
 *              crosses a calendar boundary (12/08 vs 13/08).
 *
 * Neither is hypothetical: both were reproduced against the running app, and both are fixed by
 * routing every call through apps/web/lib/locale.ts. 41 call sites were swept by hand to get
 * here. This gate is what stops number 42 landing bare.
 *
 * Scope note — only client components are checked. A server component renders once and is never
 * re-rendered in the browser, so it cannot mismatch; holding it to this rule would be cargo-culting.
 */

const WEB = resolve(__dirname);
const ROOTS = ['app', 'components', 'lib'];

/** A locale-sensitive formatting call of any kind. */
const CALL = /\.toLocale(?:Date|Time)?String\(/;
/**
 * Pinned means BOTH halves are nailed down: an explicit locale, and a timeZone in the options.
 * A locale alone still leaves the day boundary free to move.
 */
const PINNED = /\.toLocale(?:Date|Time)?String\(\s*(?:DISPLAY_LOCALE|'[^']+'|"[^"]+")\s*,\s*\{[^}]*\btimeZone\b/;
/**
 * `new Date()` with no argument is "now". The server and the browser read their clocks at
 * different instants, so these mismatch for a reason pinning cannot fix — they need a
 * client-only render or a server-supplied timestamp. Held to a ratcheting budget rather than
 * zero, so the existing ones stay visible as debt without blocking unrelated work.
 */
const NOW = /new Date\(\s*\)/;
/**
 * Known limitation, stated rather than hidden: `.toLocaleString()` is only a date formatter when
 * its receiver is a Date — on a number it is money formatting and perfectly safe (en-AE/GB/US
 * group identically). Distinguishing them by regex is not possible in general, so a plain
 * `.toLocaleString()` is only judged when the line also constructs a Date. A date held in a
 * variable and formatted on a later line slips through; the E2E hydration probe is the net.
 */
const DATE_ON_LINE = /new Date\(/;

/**
 * Budget for the "now" case, which pinning cannot fix. Lower it as those sites are converted;
 * it must never rise. Raising it means a new page load now logs a hydration error.
 */
const NOW_BUDGET = 4;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (e === 'node_modules' || e === '.next' || e === 'e2e') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

function isClientComponent(src: string): boolean {
  return /^(['"])use client\1/m.test(src.split('\n').slice(0, 3).join('\n'));
}

function scan() {
  const unpinned: string[] = [];
  const now: string[] = [];

  for (const root of ROOTS) {
    for (const file of walk(join(WEB, root))) {
      const src = readFileSync(file, 'utf8');
      if (!isClientComponent(src)) continue;

      src.split('\n').forEach((line, i) => {
        if (!CALL.test(line)) return;
        // Money formatting: a .toLocaleString() with no Date anywhere on the line.
        if (!DATE_ON_LINE.test(line) && !/\.toLocale(?:Date|Time)String\(/.test(line)) return;

        const where = `${relative(WEB, file).replace(/\\/g, '/')}:${i + 1}`;
        if (NOW.test(line)) now.push(where);
        else if (!PINNED.test(line)) unpinned.push(where);
      });
    }
  }
  return { unpinned, now };
}

describe('hydration-safe date formatting', () => {
  it('every date a client component renders is pinned to a locale AND a timezone', () => {
    const { unpinned } = scan();
    expect(
      unpinned,
      `Unpinned date formatting in a client component — the server and the browser will render\n` +
        `different text and React will discard the subtree on hydration.\n\n` +
        `Fix: import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale' and pass both:\n` +
        `  new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE })\n\n` +
        `Offending:\n  ${unpinned.join('\n  ')}\n`,
    ).toEqual([]);
  });

  it('the "now" formatting budget does not rise', () => {
    const { now } = scan();
    expect(
      now.length,
      `Formatting a no-argument new Date() in a client component mismatches on hydration because\n` +
        `the two runtimes read their clocks at different instants — pinning cannot fix it. Render\n` +
        `it client-side only, or pass a timestamp down from the server.\n\n` +
        `Sites:\n  ${now.join('\n  ')}\n`,
    ).toBeLessThanOrEqual(NOW_BUDGET);
  });
});
