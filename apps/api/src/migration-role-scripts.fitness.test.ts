import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Migration-role script fitness test (TC-GATE-21).
 *
 * Anything that connects with `MIGRATION_DATABASE_URL` is acting as the OWNING role, across every
 * tenant, with no `app.current_tenant_id` bound. Under `FORCE ROW LEVEL SECURITY` — which is on all
 * 254 tenant tables — that role is subject to its own policies unless it is a superuser or carries
 * `BYPASSRLS`. When it is not, its statements match nothing and PostgreSQL RAISES NO ERROR.
 *
 * `openCrossTenantSession` turns that into a hard failure. This test decides, per script, whether it
 * is required — and makes the decision visible, because the failure it prevents is invisible.
 */

const SCRIPTS = join(__dirname, '..', 'scripts');

/**
 * Every script that reads MIGRATION_DATABASE_URL, and whether it must open a cross-tenant session.
 *
 * `false` is not "exempt" — it is a claim, and the reason is the claim's evidence. A script that
 * reads or writes tenant rows as the owner belongs on the `true` side.
 */
const REGISTRY: Record<string, { guard: boolean; why: string }> = {
  'migrate.mjs': { guard: true, why: 'applies data backfills across every tenant' },
  'archive-events.mjs': { guard: true, why: 'a retention sweep DELETEs across every tenant' },
  'merge-duplicate-accounts.mjs': { guard: true, why: 'rewrites account references across tenants' },
  'backfill-pre-award.mjs': { guard: true, why: 'a backfill INSERTs across every tenant' },
  'orphan-scan.mjs': { guard: true, why: 'a scan that sees nothing reports a false CLEAN' },

  'rls-isolation-test.mjs': { guard: false, why: 'exists to OBSERVE RLS filtering — the guard would break the thing it proves' },
  'rls-fitness.mjs': { guard: false, why: 'reads pg_catalog, which carries no policy' },
  'provision-local-db.mjs': { guard: false, why: 'creates roles and grants; touches no tenant rows' },

  // Development and CI proof scripts. They run against a disposable database whose owner is a
  // superuser, where the guard is a no-op either way. Listed rather than pattern-matched so that a
  // proof script promoted to an operational one has to be reclassified here, deliberately.
  'estimation-workspace-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
  'mail-restart-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
  'mail-sync-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
  'pre-award-closing-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
  'pre-award-pricing-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
  'pre-award-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
  'pricing-workspace-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
  's21-risks-issues-db-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
  's22-resource-booking-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
  's22-resource-pool-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
  's22-schedule-network-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
  's22-schedule-task-identity-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
  's22-task-requirements-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
  'scope-assist-proof.mjs': { guard: false, why: 'dev/CI proof, disposable database' },
};

function migrationRoleScripts(): string[] {
  return readdirSync(SCRIPTS)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
    .filter((f) => readFileSync(join(SCRIPTS, f), 'utf8').includes('MIGRATION_DATABASE_URL'))
    .sort();
}

describe('migration-role scripts', () => {
  it('every script that acts as the migration role is classified', () => {
    expect(
      migrationRoleScripts(),
      'a new script reading MIGRATION_DATABASE_URL must be added to REGISTRY with a stated reason',
    ).toEqual(Object.keys(REGISTRY).sort());
  });

  for (const [file, { guard, why }] of Object.entries(REGISTRY)) {
    it(`${file} ${guard ? 'opens a cross-tenant session' : `does not need one — ${why}`}`, () => {
      const source = readFileSync(join(SCRIPTS, file), 'utf8');
      const opens = source.includes('openCrossTenantSession(');
      expect(
        opens,
        guard
          ? `${file} ${why}, so it must call openCrossTenantSession — otherwise an unprivileged migration role does nothing, silently`
          : `${file} is registered as not needing the guard (${why}) but calls it — reclassify it rather than leaving the registry wrong`,
      ).toBe(guard);
    });
  }

  it('the guard is the documented mechanism, not an ad-hoc SET', () => {
    const helper = readFileSync(join(SCRIPTS, 'lib', 'cross-tenant-session.mjs'), 'utf8');
    expect(helper, 'row_security = off is what converts a silent filter into an error').toContain(
      "SET row_security = off",
    );
    expect(helper, 'and the posture must be QUERIED, never parsed from a connection string').toContain('rolbypassrls');
  });
});
