import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { classifyDomainMessage } from './common/all-exceptions.filter';

/**
 * Error-taxonomy fitness test (gap register Vol 23 #8 — "inconsistent 4xx behavior").
 *
 * The global AllExceptionsFilter maps plain domain `Error`s to 403/404/409/400 by message class;
 * anything unmatched escapes as an opaque 500. This test makes the taxonomy ENFORCED: it extracts
 * every `throw new Error('…')` message literal in modules/* and apps/api and runs it through the
 * REAL classifier. A new guard message that would escape to 500 fails here — either extend the
 * classifier patterns (all-exceptions.filter.ts) or, if it is genuinely internal, add it to the
 * allowlist below.
 */

const REPO = resolve(__dirname, '../../..');

/** Genuinely-internal errors where a 500 is the correct outcome. Keep this SHORT and justified. */
const INTERNAL_ALLOWLIST: RegExp[] = [
  /^no handler for X$/, // CommandBus misconfiguration — a programming error, not client input
  /^poison: simulated handler failure$/, // poison-queue test subscriber — intentional failure
];

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

/** Extract throw-message literals; `${…}` interpolations become the placeholder "X". */
function extractThrowMessages(src: string): string[] {
  const out: string[] = [];
  const re = /throw new Error\(\s*(?:`((?:[^`\\]|\\.)*)`|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
  for (const m of src.matchAll(re)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    const msg = raw.replace(/\$\{[^}]*\}/g, 'X').trim();
    // A leftover "${" means the literal had a nested template (the regex stopped at an inner
    // backtick) — the fragment isn't a real runtime message; skip it.
    if (msg.includes('${')) continue;
    out.push(msg);
  }
  return out;
}

describe('Error taxonomy — every domain throw maps to a client-mappable status (no 500 escapes)', () => {
  it('classifies every throw-message literal in modules/* and apps/api', () => {
    const roots = [join(REPO, 'apps', 'api', 'src')];
    for (const name of readdirSync(join(REPO, 'modules'))) roots.push(join(REPO, 'modules', name, 'src'));

    const escapes = new Map<string, string>(); // message → first file
    for (const root of roots) {
      for (const file of tsFiles(root)) {
        const src = readFileSync(file, 'utf8');
        for (const msg of extractThrowMessages(src)) {
          if (!msg) continue;
          if (INTERNAL_ALLOWLIST.some((rx) => rx.test(msg))) continue;
          if (classifyDomainMessage(msg).status === 500 && !escapes.has(msg)) {
            escapes.set(msg, file.replace(REPO, ''));
          }
        }
      }
    }

    const report = [...escapes.entries()].map(([m, f]) => `  "${m}"  (${f})`).sort();
    expect(report, 'these throw messages would escape to 500 — extend classifyDomainMessage or allowlist').toEqual([]);
  });

  it('keeps the classifier sane on canonical examples', () => {
    expect(classifyDomainMessage('invoice abc not found').status).toBe(404);
    expect(classifyDomainMessage('Access denied: no grant satisfies "x"').status).toBe(403);
    expect(classifyDomainMessage('only a draft agreement can be activated (status active)').status).toBe(409);
    expect(classifyDomainMessage('3-Way Match validation failed: Invoice value (2000) exceeds PO value (1000)').status).toBe(400);
    expect(classifyDomainMessage('Quality gate blocked PO issuance: reason').status).toBe(400);
    expect(classifyDomainMessage('some totally novel internal explosion').status).toBe(500);
  });
});
