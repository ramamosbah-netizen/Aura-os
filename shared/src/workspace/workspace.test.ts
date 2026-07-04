import { describe, it, expect } from 'vitest';
import {
  defaultWorkspaceConfig,
  resolveRole,
  visibleFunctionIds,
  canAccess,
  resolveWorkspaceMe,
  mergeWorkspaceConfig,
} from './config';
import { allFunctionIds, WORKSPACE_FUNCTIONS } from './functions';
import { isAdminRole, WORKSPACE_ROLES } from './roles';

describe('workspace roles + functions', () => {
  it('every role default allow-list references only real function ids', () => {
    const known = new Set(allFunctionIds());
    const cfg = defaultWorkspaceConfig();
    for (const [role, ids] of Object.entries(cfg.roleFunctions)) {
      for (const id of ids) expect(known.has(id), `${role} → ${id}`).toBe(true);
    }
  });

  it('admin is the only admin role and sees every function', () => {
    const admins = WORKSPACE_ROLES.filter((r) => r.admin);
    expect(admins.map((r) => r.id)).toEqual(['admin']);
    const cfg = defaultWorkspaceConfig();
    expect(visibleFunctionIds(cfg, 'admin')).toEqual(allFunctionIds());
    expect(canAccess(cfg, 'admin', WORKSPACE_FUNCTIONS[0].id)).toBe(true);
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('viewer')).toBe(false);
  });
});

describe('workspace config resolution', () => {
  it('resolves an explicit assignment, else the default role', () => {
    const cfg = defaultWorkspaceConfig();
    expect(resolveRole(cfg, 'u-admin')).toBe('admin');
    expect(resolveRole(cfg, 'someone-else')).toBe('viewer'); // defaultRole
    expect(resolveRole(cfg, null)).toBe('viewer');
  });

  it('a viewer sees only the panels the admin allowed, and no quick actions', () => {
    const cfg = defaultWorkspaceConfig();
    const fns = visibleFunctionIds(cfg, 'viewer');
    expect(fns).toContain('panel.attention');
    expect(fns).not.toContain('panel.financial');
    expect(fns.some((f) => f.startsWith('action.'))).toBe(false);
    expect(canAccess(cfg, 'viewer', 'action.invoice')).toBe(false);
  });

  it('resolveWorkspaceMe returns role label + admin flag + function set', () => {
    const cfg = defaultWorkspaceConfig();
    const me = resolveWorkspaceMe(cfg, 'u-admin');
    expect(me).toMatchObject({ username: 'u-admin', role: 'admin', roleLabel: 'Administrator', isAdmin: true });
    expect(me.functions.length).toBe(allFunctionIds().length);

    const viewer = resolveWorkspaceMe(cfg, 'guest');
    expect(viewer.isAdmin).toBe(false);
    expect(viewer.role).toBe('viewer');
  });

  it('admin edits are honored: reassign a user and re-scope a role', () => {
    const cfg = defaultWorkspaceConfig();
    const next = mergeWorkspaceConfig(cfg, {
      assignments: { ...cfg.assignments, 'u-fin': 'finance' },
      roleFunctions: { ...cfg.roleFunctions, viewer: ['panel.attention', 'panel.financial'] },
    });
    expect(resolveRole(next, 'u-fin')).toBe('finance');
    expect(canAccess(next, 'viewer', 'panel.financial')).toBe(true);
    expect(typeof next.updatedAt).toBe('string');
    // base config is untouched (pure merge)
    expect(canAccess(cfg, 'viewer', 'panel.financial')).toBe(false);
  });
});
