import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Tenant-isolation fitness ratchet (gap register N-08).
 *
 * Stores expose `get(id)` with no tenant parameter — the Postgres query is literally
 * `WHERE id = $1`. Postgres RLS is the net underneath, and since G-03 it is genuinely enforced,
 * but it is ONE layer and it is absent on every no-DB path: the e2e suite, CI, and any dev boot
 * without DATABASE_URL. A service that fetches by id and hands the row back without checking the
 * bound tenant is relying entirely on the database to keep tenants apart.
 *
 * Proven, not theoretical: before the accounts path was scoped, an HTTP test showed tenant B
 * listing, reading and mutating tenant A's account (apps/api/test/rbac-tenant-isolation.e2e-spec.ts).
 *
 * Started life as a ratchet over 38 unswept services. The sweep finished on 2026-08-10, so the
 * number is now zero and this is a plain regression gate: any new service that reads by id must
 * check the tenant before returning the row.
 */

const REPO = resolve(__dirname, '../../..');
const MODULES = join(REPO, 'modules');
/**
 * The kernel is scanned too, and separately. G-20's discovery found
 * `DocumentRequirementStore.get(id)` taking no tenant — the exact shape this gate closed across
 * modules/, sitting in core/ where the gate could not see it. Compliance was about to be built on
 * that store.
 *
 * Kernel services are held to a SEPARATE, ratcheting budget rather than zero: several are
 * genuinely tenant-agnostic (platform config, RBAC grants keyed by user, saga instances), and
 * forcing a tenant argument onto those would be cargo-culting the rule rather than applying it.
 * Each one comes off the list on its own merits.
 */
const KERNEL = join(REPO, 'core', 'src');

/** Fetches a record by id — the shape that needs a tenant check before it is returned. */
const FETCHES_BY_ID = /\bthis\.\w+\.get\(\s*(?:id|\w+Id)\b/;
/**
 * A read counts as guarded either by the shared helper, or by an explicit comparison against a
 * tenant the caller supplied. Several predate the helper and write the same check longhand, in
 * both directions — `if (!x || x.tenantId !== tenantId) throw` in services, and
 * `return x.tenantId === tenantId ? x : null` in the in-memory stores. Both are equally safe and
 * neither should be reported as debt.
 */
const HAS_GUARD = /\b(assertSameTenant|sameTenantOrNull)\b|\.tenantId\s*[!=]==\s*\w+/;

/**
 * `matches` is a parameter, not a constant, because the two scans have different scopes on
 * purpose: modules are judged on their services (where RATCHET = 0 was established and must keep
 * meaning the same thing), while the kernel is judged on services AND stores — because the read
 * that started this, `DocumentRequirementStore.get(id)`, lives in a store.
 */
function walkFor(root: string, out: string[], matches: (name: string) => boolean): void {
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'dist' && entry.name !== 'node_modules') walk(p);
      } else if (matches(entry.name) && !entry.name.endsWith('.test.ts')) {
        out.push(p);
      }
    }
  };
  walk(root);
}

const isService = (n: string): boolean => n.endsWith('.service.ts');
const isServiceOrStore = (n: string): boolean => n.endsWith('.service.ts') || n.endsWith('-store.ts');

/** Kernel files that read by id without a tenant check. */
function kernelUnguarded(): string[] {
  if (!existsSync(KERNEL)) return [];
  const files: string[] = [];
  walkFor(KERNEL, files, isServiceOrStore);
  return files
    .filter((f) => {
      const body = readFileSync(f, 'utf8');
      return FETCHES_BY_ID.test(body) && !HAS_GUARD.test(body);
    })
    .map((f) => rel(f))
    .sort();
}

const rel = (f: string): string => f.slice(REPO.length + 1).split('\\').join('/');

function serviceFiles(): string[] {
  if (!existsSync(MODULES)) return [];
  const out: string[] = [];
  for (const mod of readdirSync(MODULES)) {
    const src = join(MODULES, mod, 'src');
    if (existsSync(src)) walkFor(src, out, isService);
  }
  return out;
}

function unguarded(): string[] {
  return serviceFiles()
    .filter((f) => {
      const body = readFileSync(f, 'utf8');
      return FETCHES_BY_ID.test(body) && !HAS_GUARD.test(body);
    })
    .map((f) => rel(f))
    .sort();
}

/**
 * Zero as of the 2026-08-10 sweep: every service that reads by id now checks the tenant, either
 * through the shared helper or longhand. Never raise this. A new service that reads by id must
 * apply the guard rather than reopen the debt — at zero, the ratchet is a regression gate.
 */
const RATCHET = 0;

/**
 * Kernel budget, measured 2026-08-10 after scoping the DMS requirement store. Lower it as each
 * kernel read is scoped; never raise it.
 *
 * Not zero, and deliberately not swept: the remaining ten are platform config (`modules`,
 * `settings`, `form-overrides`), identity (`access`, `companies`, `mfa`, `org`), notifications,
 * the saga store and the workflow orchestrator. Several of those are genuinely tenant-agnostic —
 * RBAC grants are keyed by user, a saga instance belongs to a run — and forcing a tenant argument
 * onto them would be cargo-culting the rule rather than applying it. Each comes off on its own
 * merits, which is what a budget allows and a blanket sweep does not.
 */
const KERNEL_RATCHET = 10;

describe('tenant-isolation fitness (N-08 ratchet)', () => {
  it(`has no more than ${RATCHET} services fetching by id without a tenant check`, () => {
    const offenders = unguarded();
    expect(
      offenders.length,
      `Unguarded by-id reads went UP. Apply sameTenantOrNull (getters) or assertSameTenant ` +
        `(fetch-before-mutate) from @aura/shared, as modules/crm/src/account.service.ts does.\n` +
        offenders.map((o) => `  ${o}`).join('\n'),
    ).toBeLessThanOrEqual(RATCHET);
  });

  it('reports every unguarded service by name, so the list is actionable not just a number', () => {
    const offenders = unguarded();
    expect(
      offenders,
      'these services read by id without checking the tenant:\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('keeps the kernel from growing more unguarded by-id reads', () => {
    // Ratchets DOWN only. Lower KERNEL_RATCHET as each is scoped; never raise it.
    const offenders = kernelUnguarded();
    expect(
      offenders.length,
      'unguarded by-id reads in core/ went UP:\n' + offenders.join('\n'),
    ).toBeLessThanOrEqual(KERNEL_RATCHET);
  });

  it('keeps the DMS requirement store scoped — compliance will be built on it', () => {
    // G-20 leans on this store. It came off the list on 2026-08-10 and must not go back on.
    expect(kernelUnguarded()).not.toContain('core/src/dms/document-requirement-store.ts');
    expect(kernelUnguarded()).not.toContain('core/src/dms/in-memory-document-requirement-store.ts');
  });

  it('keeps the already-swept paths guarded', () => {
    // Regression pins for the two paths proven over HTTP.
    for (const swept of ['modules/crm/src/account.service.ts']) {
      expect(unguarded(), `${swept} lost its tenant guard`).not.toContain(swept);
    }
  });
});
