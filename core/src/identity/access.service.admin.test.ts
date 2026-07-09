import { describe, it, expect, beforeEach } from 'vitest';
import { AccessService } from './access.service';

const tenantScope = { kind: 'org', level: 'tenant', id: 't1' } as const;

let access: AccessService;
beforeEach(() => {
  access = new AccessService();
  access.registerRole({ id: 'buyer', name: 'Buyer', permissions: ['procurement.*'] });
});

describe('AccessService — admin read/write', () => {
  it('lists registered roles', () => {
    expect(access.listRoles().map((r) => r.id)).toEqual(['buyer']);
  });

  it('grants, lists, and de-dupes identical grants', () => {
    access.grant({ userId: 'u1', roleId: 'buyer', scope: tenantScope });
    access.grant({ userId: 'u1', roleId: 'buyer', scope: tenantScope }); // idempotent
    expect(access.listGrants()).toHaveLength(1);
  });

  it('revokes a grant so the permission no longer resolves', () => {
    access.grant({ userId: 'u1', roleId: 'buyer', scope: tenantScope });
    expect(access.can('u1', { permission: 'procurement.po.approve', orgPath: [{ level: 'tenant', id: 't1' }] }).allowed).toBe(true);

    expect(access.revoke('u1', 'buyer')).toBe(true);
    expect(access.listGrants()).toHaveLength(0);
    expect(access.can('u1', { permission: 'procurement.po.approve', orgPath: [{ level: 'tenant', id: 't1' }] }).allowed).toBe(false);
  });

  it('revoke returns false when there is nothing to remove', () => {
    expect(access.revoke('nobody', 'buyer')).toBe(false);
  });
});

describe('AccessService — Postgres write-through + hydrate (gap #12)', () => {
  function fakePool() {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (/FROM public\.aura_access_roles/.test(sql)) {
          return { rows: [{ id: 'pgRole', name: 'From DB', permissions: ['finance.*'] }] };
        }
        if (/FROM public\.aura_access_grants/.test(sql)) {
          return { rows: [{ user_id: 'u-db', role_id: 'pgRole', scope: { kind: 'org', level: 'tenant', id: 't1' }, attributes: null }] };
        }
        return { rows: [], rowCount: 1 };
      },
    };
    return { pool: pool as never, calls };
  }

  it('hydrates roles and grants from Postgres on init', async () => {
    const { pool } = fakePool();
    const s = new AccessService(pool);
    await s.hydrate();
    expect(s.listRoles().map((r) => r.id)).toContain('pgRole');
    expect(s.listGrants()).toHaveLength(1);
    expect(s.can('u-db', { permission: 'finance.invoice.approve', orgPath: [{ level: 'tenant', id: 't1' }] }).allowed).toBe(true);
  });

  it('write-throughs role registration, grants, and revokes', async () => {
    const { pool, calls } = fakePool();
    const s = new AccessService(pool);
    s.registerRole({ id: 'r1', name: 'R', permissions: ['*'] });
    s.grant({ userId: 'u1', roleId: 'r1', scope: tenantScope });
    s.revoke('u1', 'r1');
    await new Promise((r) => setTimeout(r, 0)); // let fire-and-forget queries flush
    const sqls = calls.map((c) => c.sql).join('\n');
    expect(sqls).toMatch(/INSERT INTO public\.aura_access_roles/);
    expect(sqls).toMatch(/INSERT INTO public\.aura_access_grants/);
    expect(sqls).toMatch(/DELETE FROM public\.aura_access_grants/);
  });
});
