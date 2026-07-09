// Single source of truth for navigation — consumed by both the sidebar and the
// command palette, so they never drift. Add modules here as they land in T1.

export interface NavItem {
  label: string;
  href: string;
  glyph: string;
  desc: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: 'Workspace',
    items: [
      { label: 'My Work', href: '/', glyph: '◆', desc: 'Your live workspace' },
      {
        label: 'My Workspace',
        href: '/workspace',
        glyph: '◉',
        desc: 'Chat, mail, approvals inbox, notifications, saved views & search — one page',
      },
    ],
  },
  {
    title: 'Deal chain',
    items: [
      { label: 'Accounts', href: '/crm/accounts', glyph: '◎', desc: 'CRM — customers & prospects' },
      { label: 'Sales Pipeline', href: '/crm/leads', glyph: '⌥', desc: 'CRM — leads & opportunities' },
      { label: 'Quotations', href: '/crm/quotations', glyph: '✎', desc: 'CRM — customer quotes & pipeline' },
      { label: 'Tenders', href: '/tendering/tenders', glyph: '◳', desc: 'Bids & proposals' },
      { label: 'Contracts', href: '/contracts/contracts', glyph: '▦', desc: 'Awarded engagements' },
      { label: 'Projects', href: '/projects/projects', glyph: '▥', desc: 'Delivery & execution' },
      { label: 'Projects Dashboard', href: '/projects/dashboard', glyph: '📊', desc: 'Portfolio value & counts by status' },
      { label: 'Variations', href: '/projects/variations', glyph: '◷', desc: 'Change orders & revised contract value' },
      { label: 'Schedule (Gantt)', href: '/projects/schedule', glyph: '▤', desc: 'Projects — Gantt: planned vs baseline vs actual %' },
      { label: 'Payment Certificates', href: '/contracts/certificates', glyph: '◰', desc: 'Interim payment certificates (IPC) — progress billing & retention' },
    ],
  },
  {
    title: 'Operate',
    items: [
      { label: 'Procurement Dashboard', href: '/procurement/dashboard', glyph: '📊', desc: 'PO spend & counts by status' },
      { label: 'Suppliers', href: '/procurement/suppliers', glyph: '◈', desc: 'Approved-vendor master & onboarding' },
      { label: 'Purchase requests', href: '/procurement/purchase-requests', glyph: '▤', desc: 'Procurement request & approval' },
      { label: 'RFQs', href: '/procurement/rfqs', glyph: '◷', desc: 'Vendor quotations & bid comparison' },
      { label: 'Purchase orders', href: '/procurement/purchase-orders', glyph: '▣', desc: 'Procurement spend' },
      { label: 'Goods receipts', href: '/inventory/grns', glyph: '▢', desc: 'Inventory — received vs POs' },
      { label: 'Inventory Dashboard', href: '/inventory/dashboard', glyph: '📊', desc: 'Stock value & counts by warehouse' },
      { label: 'Stock', href: '/inventory/stock', glyph: '▦', desc: 'Inventory — on-hand & movements' },
      { label: 'Transfers', href: '/inventory/transfers', glyph: '⇄', desc: 'Inventory — warehouse-to-warehouse' },
      { label: 'Valuation', href: '/inventory/valuation', glyph: '▣', desc: 'Inventory — stock value at moving-average cost (WAC)' },
      { label: 'Engineering', href: '/engineering', glyph: '⚙', desc: 'Shop drawings, RFIs, & submittals' },
      { label: 'Site Control', href: '/site/control', glyph: '▤', desc: 'Site diaries, delay logs, & material consumption' },
      { label: 'Site Instructions', href: '/site/instructions', glyph: '✋', desc: 'Formal site instructions (SI) with cost/time flags' },
      { label: 'HSE Control', href: '/hse/control', glyph: '🛡', desc: 'Safety incident logs, permits to work, & CAPA' },
      { label: 'Toolbox Talks', href: '/hse/toolbox-talks', glyph: '📋', desc: 'Daily safety briefings & attendance log' },
      { label: 'Quality Control', href: '/quality/control', glyph: '✓', desc: 'Non-conformance reports, inspections, & snags' },
      { label: 'Inspection & Test Plans', href: '/quality/itps', glyph: '☑', desc: 'ITPs — hold/witness points & sign-off' },
      { label: 'Material Approvals', href: '/quality/material-approvals', glyph: '🧱', desc: 'MAR — material submittals & consultant approval' },
      { label: 'HR Dashboard', href: '/hr/dashboard', glyph: '📊', desc: 'Headcount by department & distribution' },
      { label: 'HR & Payroll', href: '/hr/control', glyph: '👤', desc: 'Employee profiles, leave logs, & payroll processing' },
      { label: 'Gratuity (EOSB)', href: '/hr/eosb', glyph: '◷', desc: 'End-of-service benefit calculator' },
      { label: 'Timesheets', href: '/hr/timesheets', glyph: '⏱', desc: 'Daily hours logging & approval' },
      { label: 'Attendance', href: '/hr/attendance', glyph: '🗓', desc: 'Daily presence — check-in/out, status & worked hours' },
      { label: 'Expense Claims', href: '/hr/expense-claims', glyph: '🧾', desc: 'Employee reimbursements — submit, approve, pay' },
      { label: 'Staff Advances', href: '/hr/staff-advances', glyph: '💵', desc: 'Salary advances / loans with installment repayment' },
      { label: 'Document Expiry', href: '/hr/document-expiry', glyph: '🪪', desc: 'Visa & work-permit expiry compliance watch-list' },
      { label: 'Fleet & Logistics', href: '/fleet/control', glyph: '🚚', desc: 'Vehicles, equipment fleet, fuel logs, & maintenance' },
      { label: 'Traffic Fines', href: '/fleet/fines', glyph: '🚦', desc: 'UAE fines — black points, driver liability, settlement' },
      { label: 'Salik (Tolls)', href: '/fleet/salik', glyph: '🛣', desc: 'Dubai road tolls — record, allocate to cost owner, dispute' },
      { label: 'Assets & Equipment', href: '/assets/control', glyph: '🔧', desc: 'Asset register, calibration, inspections, & warranties' },
      { label: 'Depreciation', href: '/assets/depreciation', glyph: '📉', desc: 'Asset depreciation schedule & net book value' },
      { label: 'AMC & Services', href: '/amc', glyph: '⚙', desc: 'Service contracts, support tickets, & SLA timers' },
      { label: 'Preventive Maintenance', href: '/amc/ppm', glyph: '♺', desc: 'PPM schedules & recurring visit generation' },
      { label: 'Invoices', href: '/finance/invoices', glyph: '◰', desc: 'Finance — supplier invoices' },
      { label: 'Customer Invoices', href: '/finance/customer-invoices', glyph: '◳', desc: 'Finance — client tax invoices & receipts (AR)' },
      { label: 'AR Aging', href: '/finance/ar-aging', glyph: '▦', desc: 'Finance — receivables aged by overdue bucket' },
      { label: 'AP Aging', href: '/finance/ap-aging', glyph: '▤', desc: 'Finance — payables aged by invoice-date bucket' },
      { label: 'Subcontracts', href: '/subcontracts/subcontracts', glyph: '▧', desc: 'Subcontractor agreements & claims' },
      { label: 'Subcontract Variations', href: '/subcontracts/variations', glyph: '◑', desc: 'Subcontract additions/omissions & approval' },
      { label: 'Back-Charges', href: '/subcontracts/back-charges', glyph: '⊟', desc: 'Subcontractor contra-charges — recover costs from claims' },
      { label: 'Finance Dashboard', href: '/finance/dashboard', glyph: '📊', desc: 'Finance — KPIs & charts (aging, P&L, cost centres)' },
      { label: 'Ledger & COA', href: '/finance/ledger', glyph: '◳', desc: 'Finance — double-entry general ledger' },
      { label: 'Financial Statements', href: '/finance/statements', glyph: '▣', desc: 'Finance — P&L, balance sheet, cash flow & trial balance from the GL' },
      { label: 'Group Consolidation', href: '/finance/consolidation', glyph: '▦', desc: 'Finance — per-company + consolidated group financials' },
      { label: 'Period Close', href: '/finance/period-close', glyph: '🔒', desc: 'Finance — lock fiscal months against further journal posting' },
      { label: 'Budgets', href: '/finance/budgets', glyph: '▥', desc: 'Finance — budgets & budget-vs-actual folded live from the GL' },
      { label: 'Revenue Recognition', href: '/finance/revenue-recognition', glyph: '◷', desc: 'Finance — IFRS-15 %-complete revenue per project & over/under-billing' },
      { label: 'Multi-Currency (FX)', href: '/finance/fx', glyph: '⇄', desc: 'Finance — exchange rates & currency conversion' },
      { label: 'Tax & VAT Filings', href: '/finance/tax', glyph: '◲', desc: 'Finance — tax codes & quarterly VAT returns' },
      { label: 'VAT Returns', href: '/finance/vat-returns', glyph: '◱', desc: 'Finance — periodic VAT return filing' },
      { label: 'Petty Cash', href: '/finance/petty-cash', glyph: '◰', desc: 'Finance — imprest cash floats & disbursements' },
      { label: 'Bank Guarantees', href: '/finance/bank-guarantees', glyph: '◲', desc: 'Finance — bonds & guarantees with expiry tracking' },
      { label: 'Post-Dated Cheques', href: '/finance/post-dated-cheques', glyph: '✎', desc: 'Finance — PDC register, maturity watch-list & clear/bounce' },
      { label: 'Bank Reconciliation', href: '/finance/bank-reconciliation', glyph: '⇌', desc: 'Finance — match statement lines to payments' },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { label: 'Insights', href: '/intelligence', glyph: '✶', desc: 'AI briefing & pipeline' },
      { label: 'Intelligence Console', href: '/admin/intelligence', glyph: '⚡', desc: 'IEC pricing & autonomy engine' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { label: 'Documents', href: '/documents', glyph: '▤', desc: 'DMS — versioned documents' },
      { label: 'Document Control', href: '/documents/control', glyph: '⧇', desc: 'Transmittals & correspondence' },
      { label: 'Submittals', href: '/doccontrol/submittals', glyph: '⊟', desc: 'Document submittal register (Code A/B/C/D review)' },
      { label: 'Templates', href: '/admin/templates', glyph: '⧇', desc: 'DMS — visual print templates' },
      { label: 'Admin Center', href: '/admin', glyph: '🛠', desc: 'Governance, configuration, integrations & observability' },
      { label: 'Roles & Access', href: '/admin/access', glyph: '🔑', desc: 'Roles & permission grants — what the API guard enforces' },
      { label: 'Webhooks', href: '/admin/webhooks', glyph: '🪝', desc: 'Outbound webhook subscriptions & delivery log' },
      { label: 'Approval Matrix', href: '/admin/approval-matrix', glyph: '✔', desc: 'Ordered approval rules per entity type' },
      { label: 'Feature Flags', href: '/admin/feature-flags', glyph: '🚩', desc: 'Toggle staged capabilities + per-tenant overrides' },
      { label: 'Connectors', href: '/admin/connectors', glyph: '🔌', desc: 'External-system integration connectors' },
      { label: 'Numbering', href: '/admin/numbering', glyph: '#️⃣', desc: 'Document numbering sequences & counters' },
      { label: 'Settings', href: '/admin/settings', glyph: '⚙', desc: 'Organisation-level key/value configuration' },
      { label: 'Audit Trail', href: '/admin/audit', glyph: '🔍', desc: 'Immutable audit log browser' },
      { label: 'Events', href: '/events', glyph: '⚡', desc: 'The event stream' },
    ],
  },
];

export const ALL_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);

/**
 * Nav group → workspace `suite.*` function id. Groups mapped here are gated by
 * the current user's allowed functions; unmapped groups (e.g. Workspace) always
 * show. Kept next to NAV so the two never drift.
 */
export const GROUP_SUITE: Record<string, string> = {
  'Deal chain': 'suite.dealChain',
  Operate: 'suite.operate',
  Intelligence: 'suite.intelligence',
  Platform: 'suite.platform',
};

/** Filter nav groups by an allowed `suite.*` set; null = show everything. */
export function visibleNav(allowedSuites: Set<string> | null): NavGroup[] {
  if (!allowedSuites) return NAV;
  return NAV.filter((g) => {
    const suite = GROUP_SUITE[g.title];
    return !suite || allowedSuites.has(suite);
  });
}

/** The nav item owning a pathname — longest href-prefix wins (breadcrumbs, AI context). */
export function findNavMatch(pathname: string): { group: string; label: string; href: string } | null {
  let match: { group: string; label: string; href: string } | null = null;
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.href === '/') continue;
      if (
        (pathname === item.href || pathname.startsWith(`${item.href}/`)) &&
        (!match || item.href.length > match.href.length)
      ) {
        match = { group: group.title, label: item.label, href: item.href };
      }
    }
  }
  return match;
}

export interface PaletteAction {
  label: string;
  href: string;
  desc: string;
}

/** ⌘K "Actions" group — each lands on the page whose creation form does the work. */
export const CREATE_ACTIONS: PaletteAction[] = [
  { label: 'Create Account', href: '/crm/accounts', desc: 'New customer or prospect' },
  { label: 'Create Lead', href: '/crm/leads', desc: 'New sales lead' },
  { label: 'Create Quotation', href: '/crm/quotations', desc: 'New customer quote' },
  { label: 'Create Tender', href: '/tendering/tenders', desc: 'New bid / proposal' },
  { label: 'Create Contract', href: '/contracts/contracts', desc: 'New awarded engagement' },
  { label: 'Create Project', href: '/projects/projects', desc: 'New delivery project' },
  { label: 'Create Purchase Request', href: '/procurement/purchase-requests', desc: 'New procurement request' },
  { label: 'Create Purchase Order', href: '/procurement/purchase-orders', desc: 'New PO' },
  { label: 'Create Invoice', href: '/finance/invoices', desc: 'New supplier invoice' },
  { label: 'Create Customer Invoice', href: '/finance/customer-invoices', desc: 'New AR tax invoice' },
  { label: 'Create Subcontract', href: '/subcontracts/subcontracts', desc: 'New subcontractor agreement' },
  { label: 'Open Inbox', href: '/inbox', desc: 'All pending approvals' },
];
