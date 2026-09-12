import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';
// The scripts are plain ESM; the helper under test is the one migrate.mjs and the operator
// scripts now open every session with.
import { openCrossTenantSession } from '../scripts/lib/cross-tenant-session.mjs';

/**
 * Real PostgreSQL proof for the migration role's RLS posture (TC-GATE-21).
 *
 * THE DEFECT THIS PINS.
 *
 * Migrations and operator scripts connect as the OWNING role and act across every tenant, binding no
 * `app.current_tenant_id`. Every tenant-scoped table here is `ENABLE` **and `FORCE`** row level
 * security, and FORCE is exactly the flag that extends RLS to the table's owner. So unless that role
 * is a superuser or carries `BYPASSRLS`, a backfill matches nothing — and PostgreSQL does not treat
 * that as an error. It is a filter. The script prints "done" over untouched data.
 *
 * NOTHING WE RUN COULD HAVE CAUGHT IT. The local disposable database and the CI service container
 * both create the owner as a superuser (`POSTGRES_USER: aura`), so the filter never engages there.
 * The runbook states that the migration role "bypasses RLS" — true when it was written, because
 * FORCE was then set on 0 of 149 tables, and false since FORCE reached all of them.
 *
 * So this suite builds the configuration nobody has: a NOSUPERUSER NOBYPASSRLS role that OWNS a
 * table shaped like every business table in this schema, and asserts both halves — that the silent
 * failure is real, and that `SET row_security = off` converts it into a loud one.
 *
 * Gated on AURA_PG_OWNER_URL, which must resolve to a role that can CREATE ROLE.
 */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
const OWNER_URL = process.env.AURA_PG_OWNER_URL;
const run = OWNER_URL ? describe : describe.skip;

const ROLE = 'g21_migration_probe';
const PW = 'g21_probe_local';
const TABLE = 'public.g21_migration_probe_rows';

run('the migration role under FORCE row level security', () => {
  let su: Client;
  let unprivileged: Client;
  let probeUrl: string;

  beforeAll(async () => {
    su = new Client({ connectionString: OWNER_URL });
    await su.connect();
    await su.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await su.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN
        EXECUTE 'DROP OWNED BY ${ROLE}'; EXECUTE 'DROP ROLE ${ROLE}';
      END IF;
    END $$;`);
    await su.query(`CREATE ROLE ${ROLE} LOGIN PASSWORD '${PW}' NOSUPERUSER NOBYPASSRLS`);
    await su.query(`GRANT CREATE ON SCHEMA public TO ${ROLE}`);
    await su.query(`GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO ${ROLE}`);

    probeUrl = (OWNER_URL as string).replace(/\/\/[^@]+@/, `//${ROLE}:${encodeURIComponent(PW)}@`);
    unprivileged = new Client({ connectionString: probeUrl });
    await unprivileged.connect();

    // Created BY the probe role, so the probe role owns it — the arrangement the runbook describes
    // for migrations ("run as the owner, never aura_app").
    await unprivileged.query(`CREATE TABLE ${TABLE} (id int primary key, tenant_id text not null, dedupe_key text)`);
    await unprivileged.query(`ALTER TABLE ${TABLE} ENABLE ROW LEVEL SECURITY`);
    await unprivileged.query(`ALTER TABLE ${TABLE} FORCE ROW LEVEL SECURITY`);
    await unprivileged.query(`CREATE POLICY tenant_isolation ON ${TABLE}
      USING (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)
      WITH CHECK (tenant_id = public.current_tenant_id() AND public.current_tenant_id() IS NOT NULL)`);

    await unprivileged.query(`SELECT set_config('app.current_tenant_id', 'tenant-x', false)`);
    for (let i = 1; i <= 3; i += 1) {
      await unprivileged.query(`INSERT INTO ${TABLE} (id, tenant_id, dedupe_key) VALUES ($1, 'tenant-x', null)`, [i]);
    }
    // From here the session is what a migration is: no tenant bound.
    await unprivileged.query(`SELECT set_config('app.current_tenant_id', '', false)`);
  });

  afterAll(async () => {
    await unprivileged?.end().catch(() => undefined);
    await su?.query(`DROP TABLE IF EXISTS ${TABLE}`).catch(() => undefined);
    await su?.query(`DROP OWNED BY ${ROLE}`).catch(() => undefined);
    await su?.query(`DROP ROLE IF EXISTS ${ROLE}`).catch(() => undefined);
    await su?.end().catch(() => undefined);
  });

  it('is subject to its own policy, because FORCE extends RLS to the owner', async () => {
    const seen = await unprivileged.query<{ n: string }>(`SELECT count(*)::int AS n FROM ${TABLE}`);
    expect(Number(seen.rows[0].n), 'three rows exist; this role owns the table and can see none of them').toBe(0);
  });

  /**
   * The failure mode itself. This is the shape every data backfill in `infrastructure/migrations`
   * is written in — 0239, 0241, 0249, 0267, 0269, 0270 and 0305.
   */
  it('silently updates NOTHING, and raises no error at all — the whole reason this gate exists', async () => {
    const res = await unprivileged.query(`UPDATE ${TABLE} SET dedupe_key = 'backfilled:' || id`);
    expect(res.rowCount, 'a backfill that reports success over zero rows').toBe(0);

    await unprivileged.query(`SELECT set_config('app.current_tenant_id', 'tenant-x', false)`);
    const after = await unprivileged.query<{ dedupe_key: string | null }>(`SELECT dedupe_key FROM ${TABLE}`);
    expect(after.rows.every((r) => r.dedupe_key === null), 'and the data is untouched').toBe(true);
    await unprivileged.query(`SELECT set_config('app.current_tenant_id', '', false)`);
  });

  it('raises instead, once the session is opened the way every script now opens it', async () => {
    const posture = await openCrossTenantSession(unprivileged, 'test');
    expect(posture.privileged, 'the probe role is neither superuser nor BYPASSRLS').toBe(false);

    await expect(
      unprivileged.query(`UPDATE ${TABLE} SET dedupe_key = 'backfilled:' || id`),
    ).rejects.toThrow(/row-level security/i);
  });

  /**
   * The other half of the contract: on the roles every deployment we can see actually uses, this
   * changes nothing. `row_security` is defined to have no effect on a role that bypasses every
   * policy, so the guard cannot make a working migration stop working.
   */
  it('is a no-op for a privileged role, so the guard costs nothing where it was already fine', async () => {
    const posture = await openCrossTenantSession(su, 'test-privileged');
    expect(posture.privileged).toBe(true);

    const res = await su.query(`UPDATE ${TABLE} SET dedupe_key = 'backfilled:' || id`);
    expect(res.rowCount, 'all three, across tenants, with no tenant bound').toBe(3);
  });
});
