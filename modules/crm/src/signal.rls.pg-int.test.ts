import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

/**
 * Real PostgreSQL proof for the Signal tenant boundary. This suite is intentionally gated: it
 * must run with CRM_PG_TEST_URL pointing at the effective application role (not a migration or
 * database-owner role). If that role bypasses RLS, the test fails instead of giving false comfort.
 */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const URL = process.env.CRM_PG_TEST_URL;
const run = URL ? describe : describe.skip;

run('CRM signals — effective-role RLS isolation', () => {
  let pool: Pool;
  let client: import('pg').PoolClient;
  const tenantA = `signal-rls-a-${Date.now()}`;
  const tenantB = `signal-rls-b-${Date.now()}`;
  const signalA = randomUUID();
  const signalB = randomUUID();
  const lineageSignal = randomUUID();
  const leadA = randomUUID();
  const leadB = randomUUID();

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL });
    client = await pool.connect();
    const role = await client.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT current_user AS rolname, r.rolsuper, r.rolbypassrls
         FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const current = role.rows[0];
    expect(current, 'CRM_PG_TEST_URL must resolve to a database role').toBeTruthy();
    expect(current.rolsuper, `role ${current.rolname} must not be superuser for RLS proof`).toBe(false);
    expect(current.rolbypassrls, `role ${current.rolname} must not bypass RLS for RLS proof`).toBe(false);
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantA]);
    await client.query('DELETE FROM public.aura_crm_signals WHERE id = $1', [signalA]).catch(() => undefined);
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantB]);
    await client.query('DELETE FROM public.aura_crm_signals WHERE id = $1', [signalB]).catch(() => undefined);
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantA]);
    await client.query('DELETE FROM public.aura_crm_leads WHERE id IN ($1, $2)', [leadA, leadB]).catch(() => undefined);
    client.release();
    await pool.end();
  });

  it('allows same-tenant read and blocks cross-tenant read/update/delete', async () => {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantA]);
    await client.query(
      `INSERT INTO public.aura_crm_signals
        (id, tenant_id, title, source, type, confidence, detected_at, status)
       VALUES ($1, $2, 'Tenant A signal', 'MANUAL', 'OTHER', 50, now(), 'NEW')`,
      [signalA, tenantA],
    );
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantB]);
    await client.query(
      `INSERT INTO public.aura_crm_signals
        (id, tenant_id, title, source, type, confidence, detected_at, status)
       VALUES ($1, $2, 'Tenant B signal', 'MANUAL', 'OTHER', 50, now(), 'NEW')`,
      [signalB, tenantB],
    );

    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantA]);
    const own = await client.query('SELECT id FROM public.aura_crm_signals WHERE id = $1', [signalA]);
    const foreign = await client.query('SELECT id FROM public.aura_crm_signals WHERE id = $1', [signalB]);
    expect(own.rowCount).toBe(1);
    expect(foreign.rowCount).toBe(0);
    expect((await client.query('UPDATE public.aura_crm_signals SET title = $2 WHERE id = $1', [signalB, 'forged'])).rowCount).toBe(0);
    expect((await client.query('DELETE FROM public.aura_crm_signals WHERE id = $1', [signalB])).rowCount).toBe(0);
    await client.query('ROLLBACK');
  });

  it('has the triage audit columns and one-lead-per-signal database guard', async () => {
    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'aura_crm_signals'
           AND column_name IN ('reviewed_by', 'reviewed_at', 'dismissal_reason_code', 'dismissal_note')`,
    );
    expect(columns.rows.map((row) => row.column_name).sort()).toEqual([
      'dismissal_note', 'dismissal_reason_code', 'reviewed_at', 'reviewed_by',
    ]);
    const index = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_crm_leads_signal_lineage'`,
    );
    expect(index.rowCount).toBe(1);
  });

  it('rejects concurrent duplicate Lead lineage for one Signal', async () => {
    const one = await pool.connect();
    const two = await pool.connect();
    try {
      await Promise.all([
        one.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantA]),
        two.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantA]),
      ]);
      const insert = (db: import('pg').PoolClient, id: string) => db.query(
        `INSERT INTO public.aura_crm_leads (id, tenant_id, name, signal_id) VALUES ($1, $2, 'Signal lead', $3)`,
        [id, tenantA, lineageSignal],
      );
      const results = await Promise.allSettled([insert(one, leadA), insert(two, leadB)]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    } finally {
      one.release();
      two.release();
    }
  });
});
