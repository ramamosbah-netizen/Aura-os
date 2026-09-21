import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedFamiliesFor, isDeclaredCategory } from '@aura/core';

/**
 * EVERY UPLOAD CATEGORY A CONTROLLER ACCEPTS MUST BE DECLARED IN THE FILE-TYPE POLICY.
 *
 * `checkFileType` falls back to a default family list for a category it does not know. The
 * default is conservative — it excludes executables and archives — so an undeclared category is
 * not a hole. It is worse than that in a quieter way: it is a category whose rule nobody chose.
 * A `certificate` should be a PDF and nothing else; an `evidence` photo should be an image. Both
 * would silently accept Office documents through the default.
 *
 * The categories live in the controllers as literal arrays validated against the request, so this
 * reads them from the source and asserts the policy has an opinion about each one. When someone
 * adds a category, this fails until they decide what may be stored under it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const API_SRC = join(repo, 'apps', 'api', 'src');

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (entry.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

/** `const categories = ['drawing', 'client_specification', …];` beside an upload handler. */
const DECL = /const categories\s*=\s*\[([^\]]*)\]/g;

function declaredCategories(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of tsFiles(API_SRC)) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('FileInterceptor')) continue;
    for (const m of src.matchAll(DECL)) {
      const cats = [...m[1].matchAll(/'([a-z0-9_-]+)'/gi)].map((c) => c[1]);
      const rel = file.slice(repo.length + 1).replace(/\\/g, '/');
      found.set(rel, [...(found.get(rel) ?? []), ...cats]);
    }
  }
  return found;
}

describe('upload categories and the file-type policy', () => {
  const declared = declaredCategories();
  const all = [...new Set([...declared.values()].flat())];

  it('finds the category lists in the controllers', () => {
    // Without this the assertion below would pass over an empty list, which is how a guard
    // reports green while checking nothing.
    expect(declared.size, 'no upload controller declared a category list').toBeGreaterThan(0);
    expect(all.length).toBeGreaterThan(5);
    expect(all).toContain('drawing');
  });

  it('has a deliberate rule for every category an upload accepts', () => {
    // Asked of the MAP, not of the returned list. Comparing against the default list would
    // accuse every category that deliberately chose the default — three of them do.
    const undeclared = all.filter((c) => !isDeclaredCategory(c));
    expect(
      undeclared,
      `these upload categories have no rule of their own and fall back to the default list:\n  ${undeclared.join('\n  ')}\n` +
        'Add each to CATEGORY_FAMILIES in core/src/dms/file-type-policy.ts, deciding what it may hold.',
    ).toEqual([]);
  });

  it('never lets an archive through any declared category', () => {
    // A ZIP is a container nothing inspects, so allowing one anywhere reopens the hole one level
    // down. This is the single invariant worth restating per category rather than trusting once.
    for (const c of all) {
      expect(allowedFamiliesFor(c), `${c} must not accept an archive`).not.toContain('archive');
    }
  });
});
