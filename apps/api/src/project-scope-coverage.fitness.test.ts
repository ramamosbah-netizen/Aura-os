import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every entity-addressed route on a project-scoped module has a resolver behind it.
 *
 * ## What this is guarding against
 *
 * `PermissionsGuard` can scope a request to a project only when the project is knowable from the
 * request. 123 routes across six delivery modules name a record and nothing else, so they fell
 * through to an org-wide grant — which meant an org-grant holder could act on any project, and a
 * project MEMBER could act on none.
 *
 * `ProjectResolverRegistry` closes that by resolving the record's project. But a resolver is
 * registered per AGGREGATE, and routes are added per feature: the failure mode is a new
 * `POST quality/waivers/:id/approve` shipping with nothing registered for `waiver`, silently
 * reverting that route to org-only authorisation. Nothing would break. Nothing would say so.
 *
 * So the routes are derived from the controllers and the registrations from the module files, and
 * the two are compared. Both halves are parsed from source rather than listed by hand, because a
 * hand-written list is the thing that goes stale.
 */
const API_SRC = __dirname;
const MODULES_DIR = join(__dirname, '../../../modules');

/** Mirrors `singular()` in the guard — route nouns become the entity segment of a permission. */
const singular = (s: string): string =>
  s.endsWith('ies') ? `${s.slice(0, -3)}y` : s.endsWith('s') && !s.endsWith('ss') ? s.slice(0, -1) : s;

/** Mirrors `PROJECT_SCOPED_MODULES` in the guard. Asserted below to still match it. */
const PROJECT_SCOPED = ['projects', 'engineering', 'site', 'quality', 'hse', 'commissioning', 'doccontrol'];

/**
 * Aggregates deliberately NOT resolvable, with the reason. An entry here is a decision on the
 * record; an omission is an oversight — which is the distinction this test exists to keep.
 */
const NOT_PROJECT_BEARING: Record<string, string> = {
  'projects:project': 'a project IS the scope; resolving it to itself adds nothing',
  'projects:member': 'membership is addressed by :projectId already, so the guard needs no resolver',
  'hse:training': 'a training record is a fact about a person’s competence, not about a site',
  'projects:quantity-ledger':
    'its only id-bearing route is `quantity-ledger/position/:boqItemId`, where the id is a BOQ ' +
    'item’s, not a ledger entry’s — there is nothing here to look up by that id',
};

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...controllerFiles(p));
    else if (name.endsWith('.controller.ts') && !name.includes('.test.')) out.push(p);
  }
  return out;
}

/** `module:entity` for every route that names a record by id and carries no project. */
function entityAddressedAggregates(): Set<string> {
  const found = new Set<string>();
  for (const file of controllerFiles(API_SRC)) {
    const src = readFileSync(file, 'utf8');
    const ctrl = (src.match(/@Controller\('([^']*)'\)/) ?? [])[1] ?? '';
    const moduleId = ctrl.split('/')[0];
    if (!PROJECT_SCOPED.includes(moduleId)) continue;

    for (const m of src.matchAll(/@(Get|Post|Put|Patch|Delete)\('?([^')]*)'?\)/g)) {
      const route = `${ctrl}/${m[2]}`.replace(/\/+/g, '/');
      if (route.includes(':projectId')) continue; // the guard reads this one directly
      if (!/:\w+/.test(route)) continue; //           no id at all: nothing to resolve
      const segs = route.split('/').filter((s) => s && !s.startsWith(':'));
      const entity = singular(segs[1] ?? '');
      if (entity) found.add(`${moduleId}:${entity}`);
    }
  }
  return found;
}

/** `module:entity` for every `registry.register(...)` call across the modules. */
function registeredAggregates(): Set<string> {
  const found = new Set<string>();
  for (const mod of readdirSync(MODULES_DIR)) {
    const file = join(MODULES_DIR, mod, 'src', 'project-resolvers.ts');
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const m of src.matchAll(/registry\.register\(\s*'([^']+)'\s*,\s*'([^']+)'/g)) {
      found.add(`${m[1]}:${m[2]}`);
    }
  }
  return found;
}

describe('project-scope coverage', () => {
  it('parses both sides, so a passing result cannot mean it read nothing', () => {
    expect(entityAddressedAggregates().size, 'entity-addressed aggregates found in the controllers').toBeGreaterThan(20);
    expect(registeredAggregates().size, 'registrations found in the modules').toBeGreaterThan(20);
  });

  it('still describes the same modules the guard scopes', () => {
    const guard = readFileSync(join(__dirname, '../../../core/src/identity/permissions.guard.ts'), 'utf8');
    const declared = [...(guard.match(/const PROJECT_SCOPED_MODULES = new Set\(\[([\s\S]*?)\]\)/) ?? ['', ''])[1]
      .matchAll(/'([^']+)'/g)].map((m) => m[1]);
    // If the guard starts scoping another module, this test must start checking it too — otherwise
    // the new module's routes are uncovered and nothing here notices.
    expect(declared.sort()).toEqual([...PROJECT_SCOPED].sort());
  });

  it('resolves every aggregate an entity-addressed route can reach', () => {
    const registered = registeredAggregates();
    const uncovered = [...entityAddressedAggregates()]
      .filter((key) => !registered.has(key))
      .filter((key) => !(key in NOT_PROJECT_BEARING))
      .sort();

    expect(
      uncovered,
      'each of these has a route naming a record by id, and nothing to resolve it to a project — ' +
        'so it is authorised org-wide only, and project members are locked out of it. Register it in ' +
        'the module’s project-resolvers.ts, or record it in NOT_PROJECT_BEARING with the reason.',
    ).toEqual([]);
  });

  it('registers nothing no route can reach', () => {
    const reachable = entityAddressedAggregates();
    // A registration for an aggregate no route addresses is dead weight that reads like coverage.
    const orphans = [...registeredAggregates()].filter((k) => !reachable.has(k)).sort();
    expect(orphans, 'registered but unreachable — either a route was removed or the name is wrong').toEqual([]);
  });
});
