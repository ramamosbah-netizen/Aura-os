// Workspace roles — the UI-layer role catalog that governs what each user sees
// on their workspace (distinct from the kernel RBAC permission grants, which
// gate the API). An administrator assigns users to these roles and configures,
// per role, which workspace functions are visible. Framework-free + static.

export type WorkspaceRoleId =
  | 'admin'
  | 'executive'
  | 'finance'
  | 'procurement'
  | 'projects'
  | 'operations'
  | 'hr'
  | 'viewer';

export interface WorkspaceRole {
  id: WorkspaceRoleId;
  label: string;
  description: string;
  /** design-system accent used for the role chip */
  color: string;
  /** admins configure the workspace and see every user's space */
  admin?: boolean;
}

export const WORKSPACE_ROLES: WorkspaceRole[] = [
  { id: 'admin', label: 'Administrator', description: 'Full access; configures the workspace for everyone.', color: '#8b5cf6', admin: true },
  { id: 'executive', label: 'Executive', description: 'Company-wide overview, all command perspectives.', color: '#5b8cff' },
  { id: 'finance', label: 'Finance', description: 'Cash, invoices, payments, budgets and profitability.', color: '#3ecf8e' },
  { id: 'procurement', label: 'Procurement', description: 'RFQs, purchase orders, suppliers and approvals.', color: '#f0b429' },
  { id: 'projects', label: 'Project Manager', description: 'Projects, schedule, variations and delivery health.', color: '#22d3ee' },
  { id: 'operations', label: 'Site / Operations', description: 'Site reports, quality (NCR) and HSE on the ground.', color: '#fb923c' },
  { id: 'hr', label: 'Human Resources', description: 'People, leave, timesheets and approvals.', color: '#f472b6' },
  { id: 'viewer', label: 'Viewer', description: 'Read-only briefing and attention feed.', color: '#8a93a6' },
];

const ROLE_BY_ID = new Map(WORKSPACE_ROLES.map((r) => [r.id, r]));

export function getRole(id: string | null | undefined): WorkspaceRole | undefined {
  return id ? ROLE_BY_ID.get(id as WorkspaceRoleId) : undefined;
}

export function isAdminRole(id: string | null | undefined): boolean {
  return getRole(id)?.admin === true;
}
