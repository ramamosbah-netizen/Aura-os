import { describe, expect, it } from 'vitest';
import {
  type AccessTarget,
  type Grant,
  type Role,
  evaluateAccess,
  permissionMatches,
  scopeContains,
} from './access';

describe('permissionMatches', () => {
  it('matches exact', () => expect(permissionMatches('procurement.po.approve', 'procurement.po.approve')).toBe(true));
  it('global wildcard matches anything', () => expect(permissionMatches('*', 'finance.invoice.create')).toBe(true));
  it('trailing wildcard matches the module', () => expect(permissionMatches('procurement.*', 'procurement.po.approve')).toBe(true));
  it('mid-segment wildcard matches one segment', () => expect(permissionMatches('procurement.*.approve', 'procurement.po.approve')).toBe(true));
  it('denies a different module', () => expect(permissionMatches('finance.*', 'procurement.po.approve')).toBe(false));
  it('denies a length mismatch', () => expect(permissionMatches('procurement.po', 'procurement.po.approve')).toBe(false));
});

const roles = new Map<string, Role>([
  ['procurementMgr', { id: 'procurementMgr', name: 'Procurement Manager', permissions: ['procurement.*'] }],
]);

// Target: approve PO-1, sitting under tenant t1 → Company A → Dept P.
const target = (amount = 50000): AccessTarget => ({
  permission: 'procurement.po.approve',
  orgPath: [
    { level: 'tenant', id: 't1' },
    { level: 'company', id: 'companyA' },
    { level: 'department', id: 'deptP' },
  ],
  resource: { type: 'po', id: 'po-1' },
  amount,
});

describe('evaluateAccess', () => {
  it('allows when the grant scope (Company A) is an ancestor of the target', () => {
    const grants: Grant[] = [
      { userId: 'u1', roleId: 'procurementMgr', scope: { kind: 'org', level: 'company', id: 'companyA' }, attributes: { approvalLimit: 100000 } },
    ];
    expect(evaluateAccess(grants, roles, target()).allowed).toBe(true);
  });

  it('denies when the grant is scoped to a different company', () => {
    const grants: Grant[] = [
      { userId: 'u1', roleId: 'procurementMgr', scope: { kind: 'org', level: 'company', id: 'companyB' } },
    ];
    expect(evaluateAccess(grants, roles, target()).allowed).toBe(false);
  });

  it('enforces the ABAC approvalLimit ceiling', () => {
    const grants: Grant[] = [
      { userId: 'u1', roleId: 'procurementMgr', scope: { kind: 'org', level: 'company', id: 'companyA' }, attributes: { approvalLimit: 100000 } },
    ];
    expect(evaluateAccess(grants, roles, target(250000)).allowed).toBe(false); // 250k > 100k
  });

  it('supports resource-scoped grants', () => {
    const grants: Grant[] = [
      { userId: 'u1', roleId: 'procurementMgr', scope: { kind: 'resource', resourceType: 'po', resourceId: 'po-1' } },
    ];
    expect(evaluateAccess(grants, roles, target()).allowed).toBe(true);
  });

  it('denies when the role lacks the permission', () => {
    const otherRoles = new Map<string, Role>([['viewer', { id: 'viewer', name: 'Viewer', permissions: ['procurement.po.read'] }]]);
    const grants: Grant[] = [{ userId: 'u1', roleId: 'viewer', scope: { kind: 'org', level: 'company', id: 'companyA' } }];
    expect(evaluateAccess(grants, otherRoles, target()).allowed).toBe(false);
  });
});

describe('scopeContains', () => {
  it('resource scope must match exactly', () => {
    expect(scopeContains({ kind: 'resource', resourceType: 'po', resourceId: 'po-2' }, target())).toBe(false);
  });
});
