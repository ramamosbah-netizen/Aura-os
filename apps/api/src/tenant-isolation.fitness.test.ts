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
 * Sweeping ~58 services at once would be a large, poorly-reviewable change, so this is a RATCHET
 * instead. It counts the services that fetch by id without a tenant check and pins the number.
 * Adding an unguarded one fails; fixing one fails too, and the fix is to lower the number — which
 * is the point. The list only shrinks.
 */

const REPO = resolve(__dirname, '../../..');
const MODULES = join(REPO, 'modules');

/** Fetches a record by id — the shape that needs a tenant check before it is returned. */
const FETCHES_BY_ID = /\bthis\.\w+\.get\(\s*(?:id|\w+Id)\b/;
/** Either guard from @aura/shared, however it was imported. */
const HAS_GUARD = /\b(assertSameTenant|sameTenantOrNull)\b/;

function serviceFiles(): string[] {
  if (!existsSync(MODULES)) return [];
  const out: string[] = [];
  for (const mod of readdirSync(MODULES)) {
    const src = join(MODULES, mod, 'src');
    if (!existsSync(src)) continue;
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'dist' && entry.name !== 'node_modules') walk(p);
        } else if (entry.name.endsWith('.service.ts') && !entry.name.endsWith('.test.ts')) {
          out.push(p);
        }
      }
    };
    walk(src);
  }
  return out;
}

function unguarded(): string[] {
  return serviceFiles()
    .filter((f) => {
      const body = readFileSync(f, 'utf8');
      return FETCHES_BY_ID.test(body) && !HAS_GUARD.test(body);
    })
    .map((f) => f.slice(REPO.length + 1).replace(/\\/g, '/'))
    .sort();
}

/**
 * Measured 2026-08-10, after CRM accounts was scoped. Lower this as services are swept; never
 * raise it. A new service that reads by id must apply the guard, not extend the debt.
 */
const RATCHET = 38;

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

  it('fails loudly when the ratchet is stale, so a sweep lowers the number', () => {
    const offenders = unguarded();
    expect(
      offenders.length,
      `${RATCHET - offenders.length} service(s) were swept since the ratchet was last set. ` +
        `Lower RATCHET to ${offenders.length} in this file to lock the gain in.`,
    ).toBe(RATCHET);
  });

  it('keeps the already-swept paths guarded', () => {
    // Regression pins for the two paths proven over HTTP.
    for (const swept of ['modules/crm/src/account.service.ts']) {
      expect(unguarded(), `${swept} lost its tenant guard`).not.toContain(swept);
    }
  });
});
