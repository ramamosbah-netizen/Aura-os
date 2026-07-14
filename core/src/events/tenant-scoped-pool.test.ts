import { describe, it, expect, vi } from 'vitest';
import { TenantScopedPool } from './tenant-scoped-pool';
import { TenantContext } from '../tenancy/tenant-context';

// A fake pg client/pool that records the SQL issued and whether the client was released.
function fakePool(queryImpl?: (sql: string, params?: unknown[]) => unknown) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let released = 0;
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return queryImpl ? queryImpl(sql, params) : { rows: [], rowCount: 0 };
    }),
    release: vi.fn(() => { released++; }),
  };
  const pool = { connect: vi.fn(async () => client) } as any;
  return { pool, client, calls, released: () => released };
}

const setConfigCall = (calls: Array<{ sql: string; params?: unknown[] }>) =>
  calls.find((c) => c.sql.includes('set_config') && (c.params?.length ?? 0) > 0);

describe('TenantScopedPool', () => {
  it('binds the bound request tenant to the GUC, then runs the query, then resets and releases', async () => {
    const { pool, calls, released } = fakePool();
    const tenant = new TenantContext();
    const wrapped = new TenantScopedPool(pool, tenant);

    await tenant.run({ tenantId: 't-A', companyId: 'c-1', actorId: null }, async () => {
      await wrapped.query('SELECT 1');
    });

    const set = setConfigCall(calls);
    expect(set?.params).toEqual(['app.current_tenant_id', 't-A', 'app.current_company_id', 'c-1']);
    // order: set_config → the real query → reset
    const idxSet = calls.findIndex((c) => c === set);
    const idxQuery = calls.findIndex((c) => c.sql === 'SELECT 1');
    const idxReset = calls.findIndex((c) => c.sql.includes("set_config('app.current_tenant_id', ''"));
    expect(idxSet).toBeLessThan(idxQuery);
    expect(idxQuery).toBeLessThan(idxReset);
    expect(released()).toBe(1);
  });

  it('FAILS CLOSED: with no bound request scope the tenant GUC is set empty', async () => {
    const { pool, calls } = fakePool();
    const wrapped = new TenantScopedPool(pool, new TenantContext());

    await wrapped.query('SELECT 1'); // no tenant.run() around it

    const set = setConfigCall(calls);
    // empty tenant → current_tenant_id() is NULL → RLS denies (does NOT fall back to dev-tenant)
    expect(set?.params).toEqual(['app.current_tenant_id', '', 'app.current_company_id', '']);
  });

  it('resets the GUC and releases the client even when the query throws (no leak on error)', async () => {
    const { pool, calls, released } = fakePool((sql) => {
      if (sql === 'BOOM') throw new Error('boom');
      return { rows: [], rowCount: 0 };
    });
    const tenant = new TenantContext();
    const wrapped = new TenantScopedPool(pool, tenant);

    await expect(
      tenant.run({ tenantId: 't-A', companyId: null, actorId: null }, () => wrapped.query('BOOM')),
    ).rejects.toThrow('boom');

    expect(calls.some((c) => c.sql.includes("set_config('app.current_tenant_id', ''"))).toBe(true); // reset ran
    expect(released()).toBe(1); // released despite the error
  });

  it('does not leak: sequential queries in different request scopes bind their own tenant', async () => {
    const { pool, calls } = fakePool();
    const tenant = new TenantContext();
    const wrapped = new TenantScopedPool(pool, tenant);

    await tenant.run({ tenantId: 't-A', companyId: null, actorId: null }, () => wrapped.query('Q'));
    await tenant.run({ tenantId: 't-B', companyId: null, actorId: null }, () => wrapped.query('Q'));

    const binds = calls.filter((c) => c.sql.includes('set_config') && (c.params?.length ?? 0) > 0);
    expect(binds[0].params?.[1]).toBe('t-A');
    expect(binds[1].params?.[1]).toBe('t-B');
  });
});
