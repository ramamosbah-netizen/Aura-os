// Workspace function catalog — the toggleable "functions" an administrator can
// allow or deny per role: Command Center panels, quick-action shortcuts, extra
// command perspectives, and navigation suites. Each function id is referenced
// by the workspace config and honored by the UI. Framework-free + static.

export type WorkspaceFunctionCategory = 'panel' | 'action' | 'perspective' | 'suite';

export interface WorkspaceFunction {
  id: string;
  label: string;
  category: WorkspaceFunctionCategory;
  description: string;
}

export const WORKSPACE_FUNCTIONS: WorkspaceFunction[] = [
  // ── Command Center panels ────────────────────────────────────────────────
  { id: 'panel.health', label: 'Business health score', category: 'panel', description: 'Hero health ring + drivers.' },
  { id: 'panel.briefing', label: 'AI Daily Briefing', category: 'panel', description: 'AI-generated briefing at the top.' },
  { id: 'panel.attention', label: 'Needs your attention', category: 'panel', description: 'The ranked decision + risk feed.' },
  { id: 'panel.nextActions', label: 'What to do next', category: 'panel', description: 'Top-3 recommended next actions.' },
  { id: 'panel.operations', label: 'Operations snapshot', category: 'panel', description: 'Projects / tenders / contracts counts.' },
  { id: 'panel.financial', label: 'Financial snapshot', category: 'panel', description: 'Payments due, invoices, pipeline.' },
  { id: 'panel.risk', label: 'Risk & compliance', category: 'panel', description: 'Over-budget, critical items, win rate.' },
  { id: 'panel.spine', label: 'Live spine', category: 'panel', description: 'Recent events + documents counts.' },

  // ── Extra command perspectives ───────────────────────────────────────────
  { id: 'perspective.ceo', label: 'CEO Command Center', category: 'perspective', description: 'Executive pipeline + cash view.' },
  { id: 'perspective.cfo', label: 'CFO Finance Portal', category: 'perspective', description: 'Finance-focused dashboard.' },
  { id: 'perspective.pm', label: 'PM WBS Dashboard', category: 'perspective', description: 'Project-manager delivery view.' },

  // ── Quick actions ────────────────────────────────────────────────────────
  { id: 'action.rfq', label: 'Create RFQ', category: 'action', description: 'Quick action shortcut.' },
  { id: 'action.po', label: 'Create Purchase Order', category: 'action', description: 'Quick action shortcut.' },
  { id: 'action.invoice', label: 'Create Invoice', category: 'action', description: 'Quick action shortcut.' },
  { id: 'action.contract', label: 'Create Contract', category: 'action', description: 'Quick action shortcut.' },
  { id: 'action.project', label: 'Create Project', category: 'action', description: 'Quick action shortcut.' },
  { id: 'action.customer', label: 'Add Customer', category: 'action', description: 'Quick action shortcut.' },
  { id: 'action.ncr', label: 'Raise NCR', category: 'action', description: 'Quick action shortcut.' },
  { id: 'action.siteReport', label: 'Log Site Report', category: 'action', description: 'Quick action shortcut.' },
  { id: 'action.ticket', label: 'Create Service Ticket', category: 'action', description: 'Quick action shortcut.' },

  // ── Navigation suites ────────────────────────────────────────────────────
  { id: 'suite.dealChain', label: 'Deal chain', category: 'suite', description: 'CRM → tenders → contracts → projects.' },
  { id: 'suite.operate', label: 'Operate', category: 'suite', description: 'Procurement, inventory, site, HSE, quality, HR, fleet, assets.' },
  { id: 'suite.finance', label: 'Finance', category: 'suite', description: 'Invoices, ledger, statements, treasury.' },
  { id: 'suite.intelligence', label: 'Intelligence', category: 'suite', description: 'AI insights + console.' },
  { id: 'suite.platform', label: 'Platform', category: 'suite', description: 'Documents, templates, audit, events.' },
];

const FN_BY_ID = new Map(WORKSPACE_FUNCTIONS.map((f) => [f.id, f]));

export function getFunction(id: string): WorkspaceFunction | undefined {
  return FN_BY_ID.get(id);
}

export function functionsByCategory(category: WorkspaceFunctionCategory): WorkspaceFunction[] {
  return WORKSPACE_FUNCTIONS.filter((f) => f.category === category);
}

/** Every function id — the admin role's default allow-list. */
export function allFunctionIds(): string[] {
  return WORKSPACE_FUNCTIONS.map((f) => f.id);
}
