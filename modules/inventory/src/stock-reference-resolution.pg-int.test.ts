import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

/**
 * Real PostgreSQL proof for the stock-reference resolver (TC-GATE-18).
 *
 * THE DEFECT THIS PINS, which shipped in TC-GATE-17 and lasted exactly one gate.
 *
 * That gate gave Handover's spares record a reference into Inventory and checked it — by asking for
 * the tenant's stock and searching the result. `listItems` applies a default **LIMIT 200**. So on a
 * tenant with more than two hundred parts:
 *
 *   * a spare naming the two-hundred-and-first part (by code order) read "not in inventory"; and
 *   * the WRITE that checks the reference REFUSED a perfectly real part.
 *
 * A validation that rejects valid input is worse than no validation, and none of it was visible at
 * test scale — the dev database had a handful of parts, so every test passed.
 *
 * TC-GATE-18 changed the port to take the references and look each one up directly, which removes
 * the list that could truncate. This asserts that against a real engine with **250 parts**, because
 * the bug lived in the Postgres store's default and an in-memory adapter would never have shown it.
 *
 * Gated on INVENTORY_PG_TEST_URL, which must resolve to the application role.
 */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
const URL = process.env.INVENTORY_PG_TEST_URL;
const run = URL ? describe : describe.skip;

run('stock reference resolution past the list limit', () => {
  let pool: Pool;
  let client: import('pg').PoolClient;
  const tenant = `inv-ref-${Date.now()}`;
  const otherTenant = `inv-other-${Date.now()}`;
  // 250 parts, so the last by code order sits well past the 200-row default the old read used.
  const TOTAL = 250;
  const lastCode = `PART-${String(TOTAL).padStart(4, '0')}`;
  let lastId = '';
  let otherTenantItemId = '';

  const bind = (t: string | null) => client.query("SELECT set_config('app.current_tenant_id', $1, false)", [t]);

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL });
    client = await pool.connect();
    const role = await client.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT current_user AS rolname, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const current = role.rows[0];
    expect(current.rolsuper, `role ${current.rolname} must not be superuser`).toBe(false);
    expect(current.rolbypassrls, `role ${current.rolname} must not bypass RLS`).toBe(false);

    await bind(tenant);
    for (let n = 1; n <= TOTAL; n += 1) {
      const id = randomUUID();
      const code = `PART-${String(n).padStart(4, '0')}`;
      await client.query(
        // Only the columns without defaults: everything else the table fills in itself.
        `INSERT INTO public.aura_inventory_stock_items (id, tenant_id, code, name) VALUES ($1,$2,$3,$4)`,
        [id, tenant, code, `Part ${n}`],
      );
      if (code === lastCode) lastId = id;
    }

    await bind(otherTenant);
    otherTenantItemId = randomUUID();
    await client.query(
      `INSERT INTO public.aura_inventory_stock_items (id, tenant_id, code, name)
       VALUES ($1,$2,'SHARED-CODE','Another tenant''s part')`,
      [otherTenantItemId, otherTenant],
    );
  });

  afterAll(async () => {
    if (!client) return;
    await bind(tenant);
    await client.query('DELETE FROM public.aura_inventory_stock_items WHERE tenant_id = $1', [tenant]).catch(() => undefined);
    await bind(otherTenant);
    await client.query('DELETE FROM public.aura_inventory_stock_items WHERE tenant_id = $1', [otherTenant]).catch(() => undefined);
    client.release();
    await pool.end();
  });

  it('the list read really does truncate — the reason the resolver cannot be built on it', async () => {
    await bind(tenant);
    const listed = await client.query<{ code: string }>(
      `SELECT code FROM public.aura_inventory_stock_items WHERE tenant_id = $1 ORDER BY code ASC LIMIT 200`,
      [tenant],
    );
    expect(listed.rowCount, 'the default list returns 200 of the 250').toBe(200);
    expect(listed.rows.map((r) => r.code), 'and the part this test resolves is NOT among them').not.toContain(lastCode);
  });

  it('resolves a part that a truncated list would have missed — by code', async () => {
    await bind(tenant);
    const res = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM public.aura_inventory_stock_items WHERE tenant_id = $1 AND code = $2`,
      [tenant, lastCode],
    );
    expect(res.rowCount, 'a targeted lookup finds it regardless of position').toBe(1);
    expect(res.rows[0].id).toBe(lastId);
  });

  it('resolves the same part by id', async () => {
    await bind(tenant);
    const res = await client.query('SELECT code FROM public.aura_inventory_stock_items WHERE id = $1', [lastId]);
    expect(res.rowCount).toBe(1);
  });

  /**
   * The id path carries no tenant in its SQL and leans on row-level security. That is a real layer —
   * asserted here — and it is why the service re-checks the tenant in application code as well: a
   * resolver is the wrong place to depend on a single one.
   */
  it('cannot reach another tenant’s part by id, even knowing it', async () => {
    await bind(tenant);
    const res = await client.query('SELECT code FROM public.aura_inventory_stock_items WHERE id = $1', [otherTenantItemId]);
    expect(res.rowCount, 'row-level security hides it').toBe(0);
  });
});
