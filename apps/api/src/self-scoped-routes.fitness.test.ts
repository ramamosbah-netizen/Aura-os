import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `@SelfScoped` skips the permission guard's assertion. Every use is listed here, with a reason.
 *
 * The decorator exists because a DISCOVERY endpoint cannot be authorised the ordinary way: "which
 * projects may I see?" names no project, so the guard would demand an org-wide grant and refuse
 * precisely the project members the endpoint is for. The handler authorises itself instead.
 *
 * That is a legitimate pattern and a dangerous habit. Used once, deliberately, it is the only way
 * to build governed discovery. Used because a route was awkward to authorise, it is an unguarded
 * endpoint with a decorator that looks like it means something.
 *
 * So the cost of adding one is: write it down here, with why the ordinary check cannot work and
 * what the handler does instead. A new `@SelfScoped` that nobody reviewed fails this test.
 */
const ALLOWED: Record<string, string> = {
  'projects.controller.ts::projects/mine':
    'Governed project discovery. The guard would derive `projects.project.read` with no resource ' +
    'on the target, so only an org-wide grant could pass and every project member — the people ' +
    'this exists for — would be refused. The handler computes the authorised project id set from ' +
    'the actor’s own grants and hands it to the query, so the count, search and page window are ' +
    'all over the authorised set. Entitled to nothing returns an empty page, not an error.',
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

/** Every `@SelfScoped()` in the API, keyed by file and the route it decorates. */
function selfScopedRoutes(): string[] {
  const found: string[] = [];
  for (const file of controllerFiles(__dirname)) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('@SelfScoped')) continue;
    const name = file.split(/[\\/]/).pop()!;
    const ctrl = (src.match(/@Controller\('([^']*)'\)/) ?? [])[1] ?? '';
    // The route decorator that follows the marker is the one it applies to.
    for (const m of src.matchAll(/@SelfScoped\(\)[\s\S]{0,200}?@(?:Get|Post|Put|Patch|Delete)\('([^']*)'\)/g)) {
      found.push(`${name}::${m[1]}`);
    }
    // A class-level use would cover every route in the file, which is never what is wanted here.
    if (/@SelfScoped\(\)\s*\n\s*@Controller/.test(src)) found.push(`${name}::<WHOLE CONTROLLER ${ctrl}>`);
  }
  return found.sort();
}

describe('@SelfScoped routes', () => {
  it('finds the controllers at all, so a passing result cannot mean it read nothing', () => {
    expect(controllerFiles(__dirname).length, 'controllers scanned').toBeGreaterThan(20);
  });

  it('are all reviewed and recorded', () => {
    const undeclared = selfScopedRoutes().filter((r) => !(r in ALLOWED));
    expect(
      undeclared,
      'these skip the permission assertion and are not in ALLOWED. Either authorise the route ' +
        'normally, or add it here with why the ordinary check cannot work and what the handler ' +
        'does instead.',
    ).toEqual([]);
  });

  it('has no entry for a route that no longer uses it', () => {
    const live = new Set(selfScopedRoutes());
    // A stale allow-list entry reads like a reviewed exception for something that is not there,
    // and would silently pre-approve the next route that happens to take the same path.
    expect([...Object.keys(ALLOWED)].filter((k) => !live.has(k)), 'recorded but no longer present').toEqual([]);
  });

  it('never covers a whole controller', () => {
    const wholeController = selfScopedRoutes().filter((r) => r.includes('<WHOLE CONTROLLER'));
    expect(wholeController, 'class-level @SelfScoped unguards every route in the file').toEqual([]);
  });
});
