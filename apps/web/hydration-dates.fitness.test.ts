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

/**
 * A locale-sensitive formatting call of any kind.
 *
 * `Intl.DateTimeFormat` is the same hazard by a different name, and was missed here until eight
 * bare sites in the My Work components reproduced the hydration error in the browser.
 */
const CALL = /(?:\.toLocale(?:Date|Time)?String|Intl\.DateTimeFormat)\(/;
/**
 * Pinned means BOTH halves are nailed down: an explicit locale, and a timeZone in the options.
 * A locale alone still leaves the day boundary free to move.
 *
 * Anchored, and matched against a slice that starts at the call itself, because an options object
 * routinely wraps onto the next line. Judging whole lines reported already-pinned calls as bare;
 * judging a few lines around the call did the opposite — a pinned neighbour vouched for a bare
 * call, and a deliberately re-bared site passed. Anchoring is what makes the locale argument of
 * THIS call the thing being read: `(undefined,` fails at the alternation before the window matters.
 */
const PINNED = /^(?:\.toLocale(?:Date|Time)?String|Intl\.DateTimeFormat)\(\s*(?:DISPLAY_LOCALE|'[^']+'|"[^"]+")\s*,[\s\S]{0,200}?\btimeZone\b/;
/** Enough to cover an options object that wraps, far short of reaching the next statement. */
const CALL_SLICE = 240;
/**
 * `new Date()` with no argument is "now". The server and the browser read their clocks at
 * different instants, so these mismatch for a reason pinning cannot fix — they need a
 * client-only render or a server-supplied timestamp. The three that existed are now rendered
 * through <GeneratedAt />, which emits nothing on the server and fills in after mount.
 */
const NOW = /new Date\(\s*\)/;
/**
 * Not every `new Date()` is rendered. Two shapes are genuinely safe and cannot be told apart
 * from a hazard by pattern alone: one inside a `useEffect` (client-only by construction), and one
 * inside an event handler that never runs during render — the jsPDF export in
 * visual-template-builder builds a string for a downloaded file, not for the DOM.
 *
 * Rather than widen the pattern until those stop matching — which would also stop it catching
 * real ones — each exemption is written at the call site and has to say why. An exemption is
 * visible in review; a loosened regex is not.
 */
const EXEMPT = /hydration-safe:/;
/**
 * Known limitation, stated rather than hidden: `.toLocaleString()` is only a date formatter when
 * its receiver is a Date — on a number it is money formatting and perfectly safe (en-AE/GB/US
 * group identically). Distinguishing them by regex is not possible in general, so a plain
 * `.toLocaleString()` is only judged when the line also constructs a Date. A date held in a
 * variable and formatted on a later line slips through; the E2E hydration probe is the net.
 */
const DATE_ON_LINE = /new Date\(/;

/**
 * Zero, and it must stay there. This started at 4 and came down as the sites were converted;
 * raising it means a page load now logs a hydration error and re-renders itself.
 */
const NOW_BUDGET = 0;

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

      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (!CALL.test(line)) return;
        // Money formatting: a .toLocaleString() with no Date anywhere on the line.
        if (!DATE_ON_LINE.test(line) && !/(?:\.toLocale(?:Date|Time)String|Intl\.DateTimeFormat)\(/.test(line)) return;
        // The reason may sit on the call itself or on the line above it.
        if (EXEMPT.test(line) || EXEMPT.test(lines[i - 1] ?? '')) return;

        const where = `${relative(WEB, file).replace(/\\/g, '/')}:${i + 1}`;
        if (NOW.test(line)) { now.push(where); return; }
        // Judge each call from where it starts, so a pinned call cannot vouch for a bare one
        // sharing the line or sitting just above it. A line may hold more than one call.
        const rest = lines.slice(i).join('\n');
        const offsets: number[] = [];
        for (const m of line.matchAll(new RegExp(CALL, 'g'))) offsets.push(m.index ?? 0);
        if (offsets.some((offset) => !PINNED.test(rest.slice(offset, offset + CALL_SLICE)))) unpinned.push(where);
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
