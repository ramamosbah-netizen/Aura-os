import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { STANDARD_ELV_ROLES } from '@aura/core';
import { permissionMatches } from '@aura/shared';
import allowlist from './permission-vocabulary-allowlist.json';

/**
 * EVERY PERMISSION THE CODE ASKS FOR IS HELD BY SOMEBODY WHO IS NOT AN ADMIN.
 *
 * SEC-01 replaces module wildcards with enumerated vocabularies, and enumeration has one predictable
 * failure: it drops whatever nobody remembered. It has now happened three times in three waves, and
 * each was found by a different accident rather than by a check:
 *
 *   finance.invoice.approve    asserted in InvoiceService, never derived from a route, so no route
 *                              audit could see it. Caught by the finance-authority fitness test.
 *   procurement.pr.create      the services assert `pr`/`po` while the routes derive
 *                              `purchase-request`/`purchase-order`. Caught by an e2e 403.
 *   procurement.rfq.award      the SUP-13/SUP-14 decision and award both declare it. Caught by the
 *                              frozen sourcing specs failing.
 *
 * Three accidents is a pattern, which is the same sentence the route audit was written after. So this
 * checks the OTHER direction from that audit: not "does this route derive a name nobody names", but
 * "does this name, which the code demands, belong to anybody at all".
 *
 * A permission only `r-admin` can satisfy is not necessarily wrong — some acts are genuinely
 * administrative — but it is always a decision, and it is listed below with the reason.
 */

const REPO = resolve(__dirname, '../../..');
const ADMIN = 'r-admin';

/**
 * Platform configuration, which is genuinely the administrator's: feature flags, numbering, connectors,
 * the module registry. Not a tenant job, so no tenant role holds them.
 */
const ADMINISTRATIVE = new Set<string>(allowlist.administrative);

/**
 * THE DEBT. 27 permissions a route or a service demands that no shipped role holds — so only an
 * administrator can dispose of an asset, approve leave, pay a payroll run or acknowledge a
 * transmittal. This is the route audit's finding from the other side, and it is recorded the same
 * way: named, so a new one fails by name, and shrinking only, so a fixed one has to be deleted by
 * hand — which is the moment somebody confirms the role that should hold it now does.
 *
 * These are NOT this wave's work. They belong to the modules SEC-01 has not reached: assets, fleet,
 * doccontrol, HR and inventory.
 */
const ACCEPTED_ORPHANS = new Set<string>(allowlist.orphaned);

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

/**
 * Every permission the running code actually demands: declared on a route with `@Permissions(…)`, or
 * asserted in a service with `{ permission: '…' }`. Both forms matter — the second is the one no
 * route audit can see, and it is where `finance.invoice.approve` was nearly lost.
 */
/**
 * MEMOISED, because this walks every .ts file in apps/api and all 22 modules and three separate
 * tests called it. Wave C added a third regex to the scan (permissions passed POSITIONALLY to an
 * assert helper) and that pushed one run past vitest's 5s default under parallel turbo load —
 * 8095ms, a TIMEOUT rather than an assertion failure. A guard that goes red on machine load is
 * worse than a slow one: it trains the reader to re-run instead of to look.
 */
let scanned: Map<string, Set<string>> | null = null;
function demandedPermissions(): Map<string, Set<string>> {
  if (scanned) return scanned;
  scanned = scanDemandedPermissions();
  return scanned;
}

function scanDemandedPermissions(): Map<string, Set<string>> {
  const roots = [join(REPO, 'apps', 'api', 'src')];
  for (const name of readdirSync(join(REPO, 'modules'))) roots.push(join(REPO, 'modules', name, 'src'));

  const found = new Map<string, Set<string>>();
  const add = (permission: string, file: string): void => {
    if (permission.includes('*')) return; // a demanded wildcard is a different question
    if (!found.has(permission)) found.set(permission, new Set());
    found.get(permission)!.add(file.replace(REPO, '').replace(/\\/g, '/'));
  };

  for (const root of roots) {
    for (const file of tsFiles(root)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/@Permissions\(\s*((?:'[^']+'\s*,?\s*)+)\)/g)) {
        for (const lit of m[1].matchAll(/'([^']+)'/g)) add(lit[1], file);
      }
      for (const m of src.matchAll(/permission:\s*'([^']+)'/g)) add(m[1], file);
      // A PERMISSION PASSED POSITIONALLY TO AN ASSERT HELPER. This third shape is how six
      // `doccontrol.document.*` names stayed invisible to this very test while the service refused
      // every non-admin who reached them: `assertDocPerm(actorId, tenantId, companyId,
      // 'doccontrol.document.submit', projectId)` names a permission in an argument list, not in a
      // decorator and not behind a `permission:` key. Matching any dotted, lower-case, wildcard-free
      // literal inside a call whose name starts with `assert` keeps this narrow enough to avoid
      // sweeping up unrelated strings, and wide enough that the next helper of this shape is seen.
      for (const m of src.matchAll(/\bassert\w*\([^)]*?'([a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+)'/g)) add(m[1], file);
    }
  }
  return found;
}

const heldByANonAdminRole = (permission: string): boolean =>
  STANDARD_ELV_ROLES.some((r) => r.id !== ADMIN && r.permissions.some((p) => permissionMatches(p, permission)));

describe('permission vocabulary — nothing the code demands belongs to nobody', () => {
  it('finds the permissions the code actually asks for', () => {
    // A scan that quietly stopped matching would pass every assertion below by finding nothing.
    const demanded = demandedPermissions();
    expect(demanded.size).toBeGreaterThan(100);
    for (const known of ['finance.invoice.approve', 'procurement.rfq.award', 'subcontracts.claim.certify',
      // The positional shape. If this one stops being found, the hole that hid the whole
      // document-approval lifecycle from this guard has reopened.
      'engineering.drawing.release']) {
      expect([...demanded.keys()], `${known} must be found — if it is not, this guard is blind`).toContain(known);
    }
  });

  it('every demanded permission is held by a role that is not the administrator', () => {
    const orphans = [...demandedPermissions()]
      .filter(([permission]) => !ADMINISTRATIVE.has(permission) && !ACCEPTED_ORPHANS.has(permission))
      .filter(([permission]) => !heldByANonAdminRole(permission))
      .map(([permission, files]) => `${permission}  (${[...files].sort()[0]})`)
      .sort();

    expect(
      orphans,
      'These permissions are demanded by a route or a service and NO shipped role holds them, so only ' +
      'an administrator can perform the act. Enumerating a module wildcard has dropped one three ' +
      'times running, so this is the likely cause: grant it to the role whose job it is. If it is ' +
      'genuinely platform configuration, or debt you are accepting on purpose, add it to ' +
      'permission-vocabulary-allowlist.json and say why in the commit.',
    ).toEqual([]);
  });

  it('every recorded orphan is STILL an orphan — a fixed one must leave the list', () => {
    // Without this the list would never shrink, and the number would stop meaning anything long
    // before it reached zero. Same reason the route allowlist has the same assertion.
    const demanded = new Set(demandedPermissions().keys());
    const fixed = [...ACCEPTED_ORPHANS]
      .filter((p) => !demanded.has(p) || heldByANonAdminRole(p))
      .sort();
    expect(
      fixed,
      'These are held by a real role now, or nothing demands them any more — delete them from ' +
      'permission-vocabulary-allowlist.json. The list is the outstanding debt, and an entry that is ' +
      'no longer true makes the total a fiction.',
    ).toEqual([]);
  });

  it('the accepted orphans are the ones SEC-01 has not reached yet', () => {
    // A statement about WHERE the debt is, asserted so it cannot drift into modules this programme
    // has already been through. Anything in a module already remediated should have been fixed there.
    const done = ['crm.', 'finance.', 'procurement.', 'subcontracts.'];
    const inFinishedModules = [...ACCEPTED_ORPHANS].filter((p) => done.some((m) => p.startsWith(m))).sort();
    expect(
      inFinishedModules,
      'These belong to modules SEC-01 has already remediated, so an orphan there is a miss rather ' +
      'than deferred work.',
    ).toEqual([]);
  });
});
