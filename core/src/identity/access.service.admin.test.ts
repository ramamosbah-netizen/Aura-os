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
