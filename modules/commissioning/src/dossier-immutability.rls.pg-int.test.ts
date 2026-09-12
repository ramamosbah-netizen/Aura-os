import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

/**
 * Real PostgreSQL proof for the dossier manifest (TC-GATE-7, migration 0300).
 *
 * The claim this table makes is narrow and load-bearing: **what the client was sent cannot be
 * edited afterwards**. A manifest that could be rewritten would be worse than no manifest, because
 * it would look like a record while behaving like a draft — and the question it exists to answer
 * ("what did they actually receive?") is one that only gets asked when somebody disputes it.
 *
 * So the same two things the test-run lineage asserts are asserted here, against a real engine under
 * the real application role:
 *
 *   1. TENANT ISOLATION — a captured line is invisible to another tenant, and with no tenant bound.
 *   2. IMMUTABILITY — SELECT and INSERT are the only policies, so UPDATE and DELETE are refused by
 *      the DATABASE rather than by a service rule one refactor from being bypassed.
 *
 * Gated on COMMISSIONING_PG_TEST_URL, which must resolve to the application role — the suite refuses
 * to run as a superuser or a BYPASSRLS role rather than give false comfort.
 */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const URL = process.env.COMMISSIONING_PG_TEST_URL;
const run = URL ? describe : describe.skip;

run('handover dossier manifest — tenant isolation and immutability', () => {
  let pool: Pool;
  let client: import('pg').PoolClient;
  const tenantA = `ho-dossier-a-${Date.now()}`;
  const tenantB = `ho-dossier-b-${Date.now()}`;
  const packageA = randomUUID();
  const itemA = randomUUID();
  // `aura_handover_packages.project_id` is uuid while the dossier table carries it as text (the same
  // pre-existing split the O&M tables have) — so one value, spelled for each column's type.
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
      `INSERT INTO public.aura_handover_packages (id, tenant_id, project_id, code, title, status, created_at, updated_at)
       VALUES ($1,$2,$3,'HO-RLS-01','RLS proof handover','draft', now(), now())`,
      [packageA, tenantA, projectA],
    );
  });

  afterAll(async () => {
    if (!client) return;
    await bind(tenantA);
    // The captured lines themselves cannot be deleted — that is the point — so cleanup drops the
    // parent package and leaves the manifest rows behind, scoped to a throwaway tenant id.
    await client.query('DELETE FROM public.aura_handover_packages WHERE id = $1', [packageA]).catch(() => undefined);
    client.release();
    await pool.end();
  });

  it('is RLS-enabled and RLS-forced', async () => {
    const res = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.aura_handover_dossier_items'::regclass`,
    );
    expect(res.rows[0].relrowsecurity, 'row level security must be enabled').toBe(true);
    expect(res.rows[0].relforcerowsecurity, 'row level security must be forced, so the owner is bound too').toBe(true);
  });

  it('grants only SELECT and INSERT — there is no policy that could permit a rewrite', async () => {
    const res = await client.query<{ cmd: string }>(
      `SELECT cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'aura_handover_dossier_items' ORDER BY cmd`,
    );
    expect(res.rows.map((r) => r.cmd).sort()).toEqual(['INSERT', 'SELECT']);
  });

  it('captures a line for the bound tenant', async () => {
    await bind(tenantA);
    await client.query(
      `INSERT INTO public.aura_handover_dossier_items
         (id, tenant_id, handover_id, project_id, issue_no, kind, source_id, reference, label, state, issued_at, issued_by, created_at)
       VALUES ($1,$2,$3,$4,1,'om_deliverable',$5,'DOC-OM-001','TC-CCTV-01 — O&M manual','accepted · rev B', now(),'u-admin', now())`,
      [itemA, tenantA, packageA, projectA, randomUUID()],
    );
    const res = await client.query('SELECT label, state, reference FROM public.aura_handover_dossier_items WHERE id = $1', [itemA]);
    expect(res.rows[0]).toMatchObject({ reference: 'DOC-OM-001', state: 'accepted · rev B' });
  });

  /**
   * The refusal is SILENT, not loud — the same mechanism as the test-run lineage.
   *
   * With no permissive policy for UPDATE or DELETE, PostgreSQL does not raise: the rows are not
   * VISIBLE to those commands, so the statement matches nothing and reports 0 rows affected. Both
   * halves are asserted — nothing was affected, and the row still reads as it was captured.
   */
  it('an UPDATE affects nothing — what was sent cannot be restated afterwards', async () => {
    await bind(tenantA);
    const res = await client.query(
      `UPDATE public.aura_handover_dossier_items SET state = 'accepted · rev C', reference = 'DOC-OM-999' WHERE id = $1`,
      [itemA],
    );
    expect(res.rowCount, 'the update must match no rows').toBe(0);
    const after = await client.query('SELECT reference, state FROM public.aura_handover_dossier_items WHERE id = $1', [itemA]);
    expect(after.rows[0], 'the manifest still says what it said at issue').toMatchObject({
      reference: 'DOC-OM-001',
      state: 'accepted · rev B',
    });
  });

  it('a DELETE affects nothing — a line cannot be removed from an issued dossier', async () => {
    await bind(tenantA);
    const res = await client.query('DELETE FROM public.aura_handover_dossier_items WHERE id = $1', [itemA]);
    expect(res.rowCount, 'the delete must match no rows').toBe(0);
    const after = await client.query('SELECT count(*)::int AS n FROM public.aura_handover_dossier_items WHERE id = $1', [itemA]);
    expect(after.rows[0].n).toBe(1);
  });

  it('refuses the same source cited twice in one issue', async () => {
    await bind(tenantA);
    const sourceId = randomUUID();
    const insert = (id: string) =>
      client.query(
        `INSERT INTO public.aura_handover_dossier_items
           (id, tenant_id, handover_id, project_id, issue_no, kind, source_id, label, issued_at, created_at)
         VALUES ($1,$2,$3,$4,2,'commissioning_certificate',$5,'TC-CCTV-01 — CCTV', now(), now())`,
        [id, tenantA, packageA, projectA, sourceId],
      );
    await insert(randomUUID());
    await expect(insert(randomUUID())).rejects.toThrow(/unique|duplicate/i);
  });

  it('refuses a citation attached to another tenant’s package', async () => {
    await bind(tenantB);
    await expect(
      client.query(
        `INSERT INTO public.aura_handover_dossier_items
           (id, tenant_id, handover_id, project_id, issue_no, kind, source_id, label, issued_at, created_at)
         VALUES ($1,$2,$3,$4,1,'training_session',$5,'stolen citation', now(), now())`,
        [randomUUID(), tenantB, packageA, projectA, randomUUID()],
      ),
      'a package id from another tenant must not be usable as a parent',
    ).rejects.toThrow(/row-level security|policy/i);
  });

  it('hides the captured line from another tenant, and from no tenant at all', async () => {
    await bind(tenantB);
    const other = await client.query('SELECT count(*)::int AS n FROM public.aura_handover_dossier_items WHERE id = $1', [itemA]);
    expect(other.rows[0].n, 'another tenant must not see the manifest').toBe(0);

    await bind(null);
    const unbound = await client.query('SELECT count(*)::int AS n FROM public.aura_handover_dossier_items WHERE id = $1', [itemA]);
    expect(unbound.rows[0].n, 'with no tenant bound the table must read empty, not open').toBe(0);
  });
});
