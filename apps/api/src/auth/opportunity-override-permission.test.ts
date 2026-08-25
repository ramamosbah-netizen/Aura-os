import { describe, it, expect } from 'vitest';
import { AccessService } from '@aura/core';
import { ELV_ROLE_MATRIX } from './elv-roles';

// Slice 9 PR-2 — prove crm.opportunity.override against the REAL matcher + the seeded ELV roles.
// Inference from the permission name is not enough (AURA wildcard semantics have been broad before):
// Sales must be DENIED, Sales Manager and Admin ALLOWED, and a plain crm.*.update must not leak in.

const TENANT = 't1';
const scope = { kind: 'org', level: 'tenant', id: TENANT } as const;
const target = { permission: 'crm.opportunity.override', orgPath: [{ level: 'tenant' as const, id: TENANT }] };

function seeded(): AccessService {
  const a = new AccessService();
  for (const r of ELV_ROLE_MATRIX) a.registerRole({ id: r.id, name: r.name, permissions: r.permissions });
  return a;
}

describe('crm.opportunity.override — manual-override permission gate', () => {
  it('Sales is DENIED — crm.*.update / create / read do not cover the override action', () => {
    const a = seeded();
    a.grant({ userId: 'u-sales', roleId: 'sales', scope });
    expect(a.can('u-sales', target).allowed).toBe(false);
    expect(() => a.assert('u-sales', target)).toThrow();
  });

  it('Sales Manager is ALLOWED — explicitly granted crm.opportunity.override', () => {
    const a = seeded();
    a.grant({ userId: 'u-mgr', roleId: 'salesManager', scope });
    expect(a.can('u-mgr', target).allowed).toBe(true);
  });

  it('Admin is ALLOWED — the * wildcard', () => {
    const a = seeded();
    a.grant({ userId: 'u-admin', roleId: 'admin', scope });
    expect(a.can('u-admin', target).allowed).toBe(true);
  });

  it('a bare crm.*.update grant does NOT leak into the override (wildcard stays scoped to the action)', () => {
    const a = seeded();
    a.registerRole({ id: 'updater', name: 'Updater', permissions: ['crm.*.update'] });
    a.grant({ userId: 'u-upd', roleId: 'updater', scope });
    expect(a.can('u-upd', target).allowed).toBe(false);
  });

  it('the override permission is NARROW — granting only it does not broaden into other actions', () => {
    const a = seeded();
    a.registerRole({ id: 'override-only', name: 'Override Only', permissions: ['crm.opportunity.override'] });
    a.grant({ userId: 'u-x', roleId: 'override-only', scope });
    expect(a.can('u-x', target).allowed).toBe(true); // has the override
    expect(a.can('u-x', { permission: 'crm.opportunity.update', orgPath: target.orgPath }).allowed).toBe(false);
    expect(a.can('u-x', { permission: 'crm.quotation.approve', orgPath: target.orgPath }).allowed).toBe(false);
  });
});
