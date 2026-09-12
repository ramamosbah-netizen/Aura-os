import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

/**
 * Real PostgreSQL proof for the test-run lineage (TC-GATE-1, migration 0296).
 *
 * Two claims are made about that table, and neither is worth anything unasserted against a real
 * engine under the real application role:
 *
 *   1. TENANT ISOLATION — a run is invisible to another tenant, and invisible with no tenant bound.
 *   2. IMMUTABILITY — the table grants SELECT and INSERT and nothing else, so UPDATE and DELETE are
 *      refused by the DATABASE. This is the whole guarantee: a service-level rule against rewriting
 *      history is one refactor from being bypassed, and the defect this gate closes was exactly a
 *      record that could be rewritten.
 *
 * Gated on COMMISSIONING_PG_TEST_URL, which must resolve to the application role — the suite refuses
 * to run as a superuser or a BYPASSRLS role rather than give false comfort.
 */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const URL = process.env.COMMISSIONING_PG_TEST_URL;
const run = URL ? describe : describe.skip;

run('commissioning test runs — tenant isolation and immutability', () => {
  let pool: Pool;
  let client: import('pg').PoolClient;
  const tenantA = `cx-runs-a-${Date.now()}`;
  const tenantB = `cx-runs-b-${Date.now()}`;
  const recordA = randomUUID();
  const itemA = randomUUID();
  const runA = randomUUID();
  // `aura_commissioning_records.project_id` is uuid while the test-item/run tables carry it as text
  // (pre-existing, recorded in the closure note) — so one value, spelled for each column's type.
  const projectA = randomUUID();

  const bind = (tenant: string | null) =>
    client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenant]);

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL });
    client = await pool.connect();
    const role = await client.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT current_user AS rolname, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const current = role.rows[0];
    expect(current, 'COMMISSIONING_PG_TEST_URL must resolve to a database role').toBeTruthy();
    expect(current.rolsuper, `role ${current.rolname} must not be superuser for an RLS proof`).toBe(false);
    expect(current.rolbypassrls, `role ${current.rolname} must not bypass RLS for an RLS proof`).toBe(false);

    await bind(tenantA);
    await client.query(
      `INSERT INTO public.aura_commissioning_records (id, tenant_id, project_id, code, title, system, status, points_total, points_passed, created_at, updated_at)
       VALUES ($1,$2,$3,'TC-RLS-01','RLS proof system','other','pending',1,0, now(), now())`,
      [recordA, tenantA, projectA],
    );
    await client.query(
      `INSERT INTO public.aura_commissioning_test_items (id, tenant_id, commissioning_id, project_id, point_no, description, result, created_at)
       VALUES ($1,$2,$3,$4,'PL-001','RLS proof point','pending', now())`,
      [itemA, tenantA, recordA, projectA],
    );
  });

  afterAll(async () => {
    if (!client) return;
    await bind(tenantA);
    // The runs themselves cannot be deleted — that is the point — so cleanup drops the parents and
    // leaves the run rows behind, scoped to a throwaway tenant id.
    await client.query('DELETE FROM public.aura_commissioning_test_items WHERE id = $1', [itemA]).catch(() => undefined);
    await client.query('DELETE FROM public.aura_commissioning_records WHERE id = $1', [recordA]).catch(() => undefined);
    client.release();
    await pool.end();
  });

  it('is RLS-enabled and RLS-forced', async () => {
    const res = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.aura_commissioning_test_runs'::regclass`,
    );
    expect(res.rows[0].relrowsecurity, 'row level security must be enabled').toBe(true);
    expect(res.rows[0].relforcerowsecurity, 'row level security must be forced, so the owner is bound too').toBe(true);
  });

  it('grants only SELECT and INSERT — there is no policy that could permit a rewrite', async () => {
    const res = await client.query<{ cmd: string }>(
      `SELECT cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'aura_commissioning_test_runs' ORDER BY cmd`,
    );
    expect(res.rows.map((r) => r.cmd).sort()).toEqual(['INSERT', 'SELECT']);
  });

  it('appends a run for the bound tenant', async () => {
    await bind(tenantA);
    await client.query(
      `INSERT INTO public.aura_commissioning_test_runs
         (id, tenant_id, test_item_id, commissioning_id, project_id, run_no, result, actual, remarks, tested_by, tested_at, created_at)
       VALUES ($1,$2,$3,$4,$5,1,'fail','104.8 m','Over length','u1', now(), now())`,
      [runA, tenantA, itemA, recordA, projectA],
    );
    const res = await client.query('SELECT result, actual FROM public.aura_commissioning_test_runs WHERE id = $1', [runA]);
    expect(res.rows[0]).toMatchObject({ result: 'fail', actual: '104.8 m' });
  });

  /**
   * HOW THE REFUSAL ACTUALLY WORKS, because the first version of this test asserted the wrong thing.
   *
   * With no permissive policy for UPDATE or DELETE, PostgreSQL does not raise — the rows are simply
   * not VISIBLE to those commands, so the statement matches nothing and reports 0 rows affected. The
   * guarantee is therefore exactly as strong (no row can be rewritten or erased) but the failure is
   * SILENT, which is worth knowing: application code that "successfully" updates a run has updated
   * nothing, and only a rowCount check would notice. That is why the service never tries.
   *
   * Both halves are asserted: nothing was affected, and the row still reads as originally recorded.
   */
  it('an UPDATE affects nothing — a recorded failure cannot be turned into a pass', async () => {
    await bind(tenantA);
    const res = await client.query(`UPDATE public.aura_commissioning_test_runs SET result = 'pass' WHERE id = $1`, [runA]);
    expect(res.rowCount, 'the update must match no rows').toBe(0);
    const after = await client.query('SELECT result, actual FROM public.aura_commissioning_test_runs WHERE id = $1', [runA]);
    expect(after.rows[0], 'the failure survived the attempt to rewrite it').toMatchObject({ result: 'fail', actual: '104.8 m' });
  });

  it('a DELETE affects nothing — a recorded failure cannot be erased', async () => {
    await bind(tenantA);
    const res = await client.query('DELETE FROM public.aura_commissioning_test_runs WHERE id = $1', [runA]);
    expect(res.rowCount, 'the delete must match no rows').toBe(0);
    const after = await client.query('SELECT count(*)::int AS n FROM public.aura_commissioning_test_runs WHERE id = $1', [runA]);
    expect(after.rows[0].n).toBe(1);
  });

  it('refuses a second run with the same number for one point', async () => {
    await bind(tenantA);
    await expect(
      client.query(
        `INSERT INTO public.aura_commissioning_test_runs
           (id, tenant_id, test_item_id, commissioning_id, project_id, run_no, result, tested_at, created_at)
         VALUES ($1,$2,$3,$4,$5,1,'pass', now(), now())`,
        [randomUUID(), tenantA, itemA, recordA, projectA],
      ),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('hides the run from another tenant, and from no tenant at all', async () => {
    await bind(tenantB);
    const other = await client.query('SELECT count(*)::int AS n FROM public.aura_commissioning_test_runs WHERE id = $1', [runA]);
    expect(other.rows[0].n).toBe(0);

    await bind(null);
    const unbound = await client.query('SELECT count(*)::int AS n FROM public.aura_commissioning_test_runs WHERE id = $1', [runA]);
    expect(unbound.rows[0].n, 'unbound must be fail-closed, not fail-open').toBe(0);
  });

  it('refuses a run attached to another tenant’s test point', async () => {
    await bind(tenantB);
    await expect(
      client.query(
        `INSERT INTO public.aura_commissioning_test_runs
           (id, tenant_id, test_item_id, commissioning_id, project_id, run_no, result, tested_at, created_at)
         VALUES ($1,$2,$3,$4,$5,1,'pass', now(), now())`,
        [randomUUID(), tenantB, itemA, recordA, projectA],
      ),
    ).rejects.toThrow(/policy/i);
  });
});
