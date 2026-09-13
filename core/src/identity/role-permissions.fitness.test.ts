import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { permissionMatches } from '@aura/shared';
import { derivePermissionFromRoute } from './permissions.guard';

/**
 * A role permission pattern must be able to match something.
 *
 * The taxonomy the guard derives is three segments — `module.entity.action` — for every handler
 * that carries no explicit `@Permissions`. `permissionMatches` walks the pattern segment by segment
 * and requires the lengths to agree unless the pattern ends in `*`. So a two-segment pattern like
 * `site.read` matches ONLY a literal permission `site.read`, and no route derives that. It is not a
 * narrower grant; it is a grant of nothing.
 *
 * Six of them were live at once — `site.read`, `quality.read`, `hse.read`, `engineering.read`,
 * `doccontrol.read`, `inventory.read` — across all four delivery roles that project membership
 * assigns. A user added to a project therefore held a role that authorised no cross-module read,
 * and every attempt was a 403 that looked like a scoping problem rather than a typo in a role.
 *
 * Nothing failed loudly because a grant that matches nothing is indistinguishable from a grant that
 * was never meant to apply. That is exactly the kind of silence a fitness test is for.
 */
const SOURCES = [
  join(__dirname, 'access.service.ts'),
  join(__dirname, '../../../apps/api/src/auth/elv-roles.ts'),
];

/** Every quoted permission pattern in a role definition, with the file it came from. */
function declaredPatterns(): Array<{ file: string; pattern: string }> {
  const found: Array<{ file: string; pattern: string }> = [];
  for (const file of SOURCES) {
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue; // the API package may not be present in every build context
    }
    for (const block of src.matchAll(/permissions: \[([\s\S]*?)\]/g)) {
      for (const raw of block[1].split(',')) {
        const pattern = raw.trim().replace(/^'|'$/g, '');
        // Skip identifiers (e.g. the COMMS constant), comments and empties — only literals matter.
        if (!pattern || !/^[a-z0-9*.-]+$/.test(pattern)) continue;
        found.push({ file: file.split(/[\\/]/).pop()!, pattern });
      }
    }
  }
  return found;
}

describe('role permission patterns', () => {
  it('finds the role definitions at all, so the scan cannot pass by reading nothing', () => {
    const patterns = declaredPatterns();
    expect(patterns.length, 'the sources parsed and yielded permission patterns').toBeGreaterThan(40);
    expect(patterns.some((p) => p.pattern === '*'), 'the admin wildcard is among them').toBe(true);
  });

  it('never declares a pattern that cannot match a derived permission', () => {
    const dead = declaredPatterns().filter(({ pattern }) => {
      if (pattern === '*') return false;
      const segs = pattern.split('.');
      // One or two segments can only match a permission of the same length. The guard derives three,
      // so anything shorter is dead unless its last segment is the catch-all `*`.
      return segs.length < 3 && segs[segs.length - 1] !== '*';
    });

    expect(
      dead.map((d) => `${d.file}: '${d.pattern}' — did you mean '${d.pattern.split('.')[0]}.*.${d.pattern.split('.')[1]}'?`),
      'a pattern shorter than module.entity.action, not ending in *, grants nothing',
    ).toEqual([]);
  });

  it('proves the rule on the real thing: the shapes the guard actually derives', () => {
    // Not a hand-written string — the permission a real route produces, so this test tracks the
    // guard rather than a copy of the guard's rules.
    const derived = derivePermissionFromRoute('GET', 'engineering', 'drawings/:id');
    expect(derived).toBe('engineering.drawing.read');

    expect(permissionMatches('engineering.read', derived!), 'the dead shape').toBe(false);
    expect(permissionMatches('engineering.*.read', derived!), 'the shape that works').toBe(true);
    expect(permissionMatches('engineering.*', derived!), 'a trailing wildcard covers it too').toBe(true);
    expect(permissionMatches('*', derived!), 'and the admin wildcard').toBe(true);
  });
});
