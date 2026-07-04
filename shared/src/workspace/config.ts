// Workspace configuration — the admin-editable mapping of (a) users → roles and
// (b) roles → allowed workspace functions. Pure resolution helpers so both the
// API and the web filter identically. Framework-free + unit-tested.

import { WORKSPACE_ROLES, type WorkspaceRoleId, isAdminRole } from './roles';
import { allFunctionIds } from './functions';

export interface WorkspaceConfig {
  /** username (session sub, e.g. "u-admin") → role id */
  assignments: Record<string, WorkspaceRoleId>;
  /** role id → allowed function ids */
  roleFunctions: Record<string, string[]>;
  /** role for any user without an explicit assignment */
  defaultRole: WorkspaceRoleId;
  updatedAt?: string;
}

/** Sensible per-role starting allow-lists — admin gets everything. */
export function defaultRoleFunctions(): Record<string, string[]> {
  const all = allFunctionIds();
  return {
    admin: [...all],
    executive: [
      'panel.health', 'panel.briefing', 'panel.attention', 'panel.nextActions',
      'panel.operations', 'panel.financial', 'panel.risk', 'panel.spine',
      'perspective.ceo', 'perspective.cfo', 'perspective.pm',
      'action.contract', 'action.project', 'action.customer',
      'suite.dealChain', 'suite.operate', 'suite.finance', 'suite.intelligence', 'suite.platform',
    ],
    finance: [
      'panel.health', 'panel.briefing', 'panel.attention', 'panel.nextActions', 'panel.financial', 'panel.risk',
      'perspective.cfo',
      'action.invoice', 'action.po',
      // finance pages (invoices, ledger, treasury) live under the Operate nav group
      'suite.finance', 'suite.dealChain', 'suite.operate',
    ],
    procurement: [
      'panel.briefing', 'panel.attention', 'panel.nextActions', 'panel.operations',
      'action.rfq', 'action.po',
      'suite.operate',
    ],
    projects: [
      'panel.health', 'panel.briefing', 'panel.attention', 'panel.nextActions', 'panel.operations', 'panel.risk',
      'perspective.pm',
      'action.project', 'action.siteReport',
      'suite.dealChain', 'suite.operate',
    ],
    operations: [
      'panel.briefing', 'panel.attention', 'panel.nextActions', 'panel.operations',
      'action.siteReport', 'action.ncr', 'action.ticket',
      'suite.operate',
    ],
    hr: [
      'panel.briefing', 'panel.attention', 'panel.nextActions',
      'suite.operate',
    ],
    viewer: [
      'panel.briefing', 'panel.attention',
    ],
  };
}

export function defaultWorkspaceConfig(): WorkspaceConfig {
  return {
    // seeded demo directory so the admin center is populated out of the box
    assignments: {
      'u-admin': 'admin',
      'u-ceo': 'executive',
      'u-finance': 'finance',
      'u-procure': 'procurement',
      'u-pm': 'projects',
      'u-site': 'operations',
      'u-hr': 'hr',
    },
    roleFunctions: defaultRoleFunctions(),
    defaultRole: 'viewer',
    updatedAt: new Date().toISOString(),
  };
}

/** The role a user resolves to (explicit assignment, else the default role). */
export function resolveRole(config: WorkspaceConfig, username: string | null | undefined): WorkspaceRoleId {
  if (username && config.assignments[username]) return config.assignments[username];
  return config.defaultRole;
}

/** Allowed function ids for a role — admin roles always see everything. */
export function visibleFunctionIds(config: WorkspaceConfig, role: WorkspaceRoleId): string[] {
  if (isAdminRole(role)) return allFunctionIds();
  return config.roleFunctions[role] ?? [];
}

export function canAccess(config: WorkspaceConfig, role: WorkspaceRoleId, functionId: string): boolean {
  if (isAdminRole(role)) return true;
  return (config.roleFunctions[role] ?? []).includes(functionId);
}

/** The effective view for one user — used by GET /workspace/me. */
export interface WorkspaceMe {
  username: string;
  role: WorkspaceRoleId;
  roleLabel: string;
  isAdmin: boolean;
  functions: string[];
}

export function resolveWorkspaceMe(config: WorkspaceConfig, username: string): WorkspaceMe {
  const role = resolveRole(config, username);
  const meta = WORKSPACE_ROLES.find((r) => r.id === role);
  return {
    username,
    role,
    roleLabel: meta?.label ?? role,
    isAdmin: isAdminRole(role),
    functions: visibleFunctionIds(config, role),
  };
}

/** Merge a partial update into a config (admin PUT), keeping unknown keys intact. */
export function mergeWorkspaceConfig(base: WorkspaceConfig, patch: Partial<WorkspaceConfig>): WorkspaceConfig {
  return {
    assignments: patch.assignments ?? base.assignments,
    roleFunctions: patch.roleFunctions ?? base.roleFunctions,
    defaultRole: patch.defaultRole ?? base.defaultRole,
    updatedAt: new Date().toISOString(),
  };
}
