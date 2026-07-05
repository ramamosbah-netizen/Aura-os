// Single source of truth for navigation — consumed by the sidebar, the header
// tab strip, and the command palette, so they never drift.
//
// Enterprise IA: the sidebar lists SUITES (one row per business area, grouped in
// sections). The pages inside the active suite render as horizontal tabs in the
// header, so moving between sibling pages never requires the sidebar.

export interface NavItem {
  label: string;
  href: string;
  glyph: string;
  desc: string;
}

export interface Suite {
  label: string;
  glyph: string;
  desc: string;
  items: NavItem[];
}

export interface Section {
  title: string;
  suites: Suite[];
}

export const SECTIONS: Section[] = [
  {
    title: 'Workspace',
    suites: [
      {
        label: 'My Workspace',
        glyph: '◆',
        desc: 'Your live work queue, saved views & notifications',
        items: [
          { label: 'My Work', href: '/', glyph: '◆', desc: 'Your live workspace' },
          { label: 'Inbox', href: '/inbox', glyph: '📥', desc: 'Every pending approval & action in one queue' },
          { label: 'Saved Views', href: '/views', glyph: '★', desc: 'Saved list filters' },
          { label: 'Notifications', href: '/notifications', glyph: '🔔', desc: 'In-app notification center (event-driven)' },
        ],
      },
    ],
  },
  {
    title: 'Sales',
    suites: [
      {
        label: 'CRM',
        glyph: '◎',
        desc: 'Accounts, pipeline & quotations',
        items: [
          { label: 'Accounts', href: '/crm/accounts', glyph: '◎', desc: 'CRM — customers & prospects' },
          { label: 'Sales Pipeline', href: '/crm/leads', glyph: '⌥', desc: 'CRM — leads & opportunities' },
          { label: 'Quotations', href: '/crm/quotations', glyph: '✎', desc: 'CRM — customer quotes & pipeline' },
        ],
      },
      {
        label: 'Tendering',
        glyph: '◳',
        desc: 'Bids & proposals',
        items: [
          { label: 'Tenders', href: '/tendering/tenders', glyph: '◳', desc: 'Bids & proposals' },
        ],
      },
    ],
  },
  {
    title: 'Delivery',
    suites: [
      {
        label: 'Contracts',
        glyph: '▦',
        desc: 'Awarded engagements & progress billing',
        items: [
          { label: 'Contracts', href: '/contracts/contracts', glyph: '▦', desc: 'Awarded engagements' },
          { label: 'Payment Certificates', href: '/contracts/certificates', glyph: '◰', desc: 'Interim payment certificates (IPC) — progress billing & retention' },
        ],
      },
      {
        label: 'Projects',
        glyph: '▥',
        desc: 'Delivery, variations & scheduling',
        items: [
          { label: 'Projects', href: '/projects/projects', glyph: '▥', desc: 'Delivery & execution' },
          { label: 'Dashboard', href: '/projects/dashboard', glyph: '📊', desc: 'Portfolio value & counts by status' },
          { label: 'Variations', href: '/projects/variations', glyph: '◷', desc: 'Change orders & revised contract value' },
          { label: 'Schedule (Gantt)', href: '/projects/schedule', glyph: '▤', desc: 'Projects — Gantt: planned vs baseline vs actual %' },
        ],
      },
      {
        label: 'Subcontracts',
        glyph: '▧',
        desc: 'Subcontractor agreements, variations & back-charges',
        items: [
          { label: 'Subcontracts', href: '/subcontracts/subcontracts', glyph: '▧', desc: 'Subcontractor agreements & claims' },
          { label: 'Variations', href: '/subcontracts/variations', glyph: '◑', desc: 'Subcontract additions/omissions & approval' },
          { label: 'Back-Charges', href: '/subcontracts/back-charges', glyph: '⊟', desc: 'Subcontractor contra-charges — recover costs from claims' },
        ],
      },
    ],
  },
  {
    title: 'Operations',
    suites: [
      {
        label: 'Procurement',
        glyph: '▣',
        desc: 'Suppliers, requests, RFQs & purchase orders',
        items: [
          { label: 'Dashboard', href: '/procurement/dashboard', glyph: '📊', desc: 'PO spend & counts by status' },
          { label: 'Suppliers', href: '/procurement/suppliers', glyph: '◈', desc: 'Approved-vendor master & onboarding' },
          { label: 'Purchase Requests', href: '/procurement/purchase-requests', glyph: '▤', desc: 'Procurement request & approval' },
          { label: 'RFQs', href: '/procurement/rfqs', glyph: '◷', desc: 'Vendor quotations & bid comparison' },
          { label: 'Purchase Orders', href: '/procurement/purchase-orders', glyph: '▣', desc: 'Procurement spend' },
        ],
      },
      {
        label: 'Inventory',
        glyph: '▦',
        desc: 'Stock, receipts, transfers & valuation',
        items: [
          { label: 'Dashboard', href: '/inventory/dashboard', glyph: '📊', desc: 'Stock value & counts by warehouse' },
          { label: 'Stock', href: '/inventory/stock', glyph: '▦', desc: 'Inventory — on-hand & movements' },
          { label: 'Goods Receipts', href: '/inventory/grns', glyph: '▢', desc: 'Inventory — received vs POs' },
          { label: 'Transfers', href: '/inventory/transfers', glyph: '⇄', desc: 'Inventory — warehouse-to-warehouse' },
          { label: 'Valuation', href: '/inventory/valuation', glyph: '▣', desc: 'Inventory — stock value at moving-average cost (WAC)' },
        ],
      },
      {
        label: 'Site & Engineering',
        glyph: '⚙',
        desc: 'Drawings, RFIs, site diaries & instructions',
        items: [
          { label: 'Engineering', href: '/engineering', glyph: '⚙', desc: 'Shop drawings, RFIs, & submittals' },
          { label: 'Site Control', href: '/site/control', glyph: '▤', desc: 'Site diaries, delay logs, & material consumption' },
          { label: 'Site Instructions', href: '/site/instructions', glyph: '✋', desc: 'Formal site instructions (SI) with cost/time flags' },
        ],
      },
      {
        label: 'HSE',
        glyph: '🛡',
        desc: 'Safety incidents, permits & toolbox talks',
        items: [
          { label: 'HSE Control', href: '/hse/control', glyph: '🛡', desc: 'Safety incident logs, permits to work, & CAPA' },
          { label: 'Toolbox Talks', href: '/hse/toolbox-talks', glyph: '📋', desc: 'Daily safety briefings & attendance log' },
        ],
      },
      {
        label: 'Quality',
        glyph: '✓',
        desc: 'NCRs, inspections & material approvals',
        items: [
          { label: 'Quality Control', href: '/quality/control', glyph: '✓', desc: 'Non-conformance reports, inspections, & snags' },
          { label: 'Inspection & Test Plans', href: '/quality/itps', glyph: '☑', desc: 'ITPs — hold/witness points & sign-off' },
          { label: 'Material Approvals', href: '/quality/material-approvals', glyph: '🧱', desc: 'MAR — material submittals & consultant approval' },
        ],
      },
      {
        label: 'Fleet',
        glyph: '🚚',
        desc: 'Vehicles, fuel, fines & tolls',
        items: [
          { label: 'Fleet & Logistics', href: '/fleet/control', glyph: '🚚', desc: 'Vehicles, equipment fleet, fuel logs, & maintenance' },
          { label: 'Traffic Fines', href: '/fleet/fines', glyph: '🚦', desc: 'UAE fines — black points, driver liability, settlement' },
          { label: 'Salik (Tolls)', href: '/fleet/salik', glyph: '🛣', desc: 'Dubai road tolls — record, allocate to cost owner, dispute' },
        ],
      },
      {
        label: 'Assets',
        glyph: '🔧',
        desc: 'Asset register, calibration & depreciation',
        items: [
          { label: 'Assets & Equipment', href: '/assets/control', glyph: '🔧', desc: 'Asset register, calibration, inspections, & warranties' },
          { label: 'Depreciation', href: '/assets/depreciation', glyph: '📉', desc: 'Asset depreciation schedule & net book value' },
        ],
      },
      {
        label: 'AMC & Services',
        glyph: '♺',
        desc: 'Service contracts, tickets & preventive maintenance',
        items: [
          { label: 'Service Contracts', href: '/amc', glyph: '⚙', desc: 'Service contracts, support tickets, & SLA timers' },
          { label: 'Preventive Maintenance', href: '/amc/ppm', glyph: '♺', desc: 'PPM schedules & recurring visit generation' },
        ],
      },
    ],
  },
  {
    title: 'Finance',
    suites: [
      {
        label: 'Finance',
        glyph: '◰',
        desc: 'AR, AP, cash & banking',
        items: [
          { label: 'Dashboard', href: '/finance/dashboard', glyph: '📊', desc: 'Finance — KPIs & charts (aging, P&L, cost centres)' },
          { label: 'Customer Invoices', href: '/finance/customer-invoices', glyph: '◳', desc: 'Finance — client tax invoices & receipts (AR)' },
          { label: 'AR Aging', href: '/finance/ar-aging', glyph: '▦', desc: 'Finance — receivables aged by overdue bucket' },
          { label: 'Supplier Invoices', href: '/finance/invoices', glyph: '◰', desc: 'Finance — supplier invoices' },
          { label: 'AP Aging', href: '/finance/ap-aging', glyph: '▤', desc: 'Finance — payables aged by invoice-date bucket' },
          { label: 'Petty Cash', href: '/finance/petty-cash', glyph: '◰', desc: 'Finance — imprest cash floats & disbursements' },
          { label: 'Post-Dated Cheques', href: '/finance/post-dated-cheques', glyph: '✎', desc: 'Finance — PDC register, maturity watch-list & clear/bounce' },
          { label: 'Bank Reconciliation', href: '/finance/bank-reconciliation', glyph: '⇌', desc: 'Finance — match statement lines to payments' },
          { label: 'Bank Guarantees', href: '/finance/bank-guarantees', glyph: '◲', desc: 'Finance — bonds & guarantees with expiry tracking' },
          { label: 'Multi-Currency (FX)', href: '/finance/fx', glyph: '⇄', desc: 'Finance — exchange rates & currency conversion' },
        ],
      },
      {
        label: 'Accounting',
        glyph: '◳',
        desc: 'General ledger, statements, budgets & tax',
        items: [
          { label: 'Ledger & COA', href: '/finance/ledger', glyph: '◳', desc: 'Finance — double-entry general ledger' },
          { label: 'Financial Statements', href: '/finance/statements', glyph: '▣', desc: 'Finance — P&L, balance sheet, cash flow & trial balance from the GL' },
          { label: 'Consolidation', href: '/finance/consolidation', glyph: '▦', desc: 'Finance — per-company + consolidated group financials' },
          { label: 'Period Close', href: '/finance/period-close', glyph: '🔒', desc: 'Finance — lock fiscal months against further journal posting' },
          { label: 'Budgets', href: '/finance/budgets', glyph: '▥', desc: 'Finance — budgets & budget-vs-actual folded live from the GL' },
          { label: 'Revenue Recognition', href: '/finance/revenue-recognition', glyph: '◷', desc: 'Finance — IFRS-15 %-complete revenue per project & over/under-billing' },
          { label: 'Tax & VAT', href: '/finance/tax', glyph: '◲', desc: 'Finance — tax codes & quarterly VAT returns' },
          { label: 'VAT Returns', href: '/finance/vat-returns', glyph: '◱', desc: 'Finance — periodic VAT return filing' },
        ],
      },
    ],
  },
  {
    title: 'People',
    suites: [
      {
        label: 'HR & Payroll',
        glyph: '👤',
        desc: 'Employees, payroll, time & expenses',
        items: [
          { label: 'Dashboard', href: '/hr/dashboard', glyph: '📊', desc: 'Headcount by department & distribution' },
          { label: 'HR & Payroll', href: '/hr/control', glyph: '👤', desc: 'Employee profiles, leave logs, & payroll processing' },
          { label: 'Timesheets', href: '/hr/timesheets', glyph: '⏱', desc: 'Daily hours logging & approval' },
          { label: 'Attendance', href: '/hr/attendance', glyph: '🗓', desc: 'Daily presence — check-in/out, status & worked hours' },
          { label: 'Expense Claims', href: '/hr/expense-claims', glyph: '🧾', desc: 'Employee reimbursements — submit, approve, pay' },
          { label: 'Staff Advances', href: '/hr/staff-advances', glyph: '💵', desc: 'Salary advances / loans with installment repayment' },
          { label: 'Gratuity (EOSB)', href: '/hr/eosb', glyph: '◷', desc: 'End-of-service benefit calculator' },
          { label: 'Document Expiry', href: '/hr/document-expiry', glyph: '🪪', desc: 'Visa & work-permit expiry compliance watch-list' },
        ],
      },
    ],
  },
  {
    title: 'Platform',
    suites: [
      {
        label: 'Documents',
        glyph: '▤',
        desc: 'DMS, transmittals, submittals & templates',
        items: [
          { label: 'Library', href: '/documents', glyph: '▤', desc: 'DMS — versioned documents' },
          { label: 'Document Control', href: '/documents/control', glyph: '⧇', desc: 'Transmittals & correspondence' },
          { label: 'Submittals', href: '/doccontrol/submittals', glyph: '⊟', desc: 'Document submittal register (Code A/B/C/D review)' },
          { label: 'Templates', href: '/admin/templates', glyph: '⧇', desc: 'DMS — visual print templates' },
        ],
      },
      {
        label: 'Intelligence',
        glyph: '✶',
        desc: 'AI briefing, insights & autonomy engine',
        items: [
          { label: 'Insights', href: '/intelligence', glyph: '✶', desc: 'AI briefing & pipeline' },
          { label: 'Intelligence Console', href: '/admin/intelligence', glyph: '⚡', desc: 'IEC pricing & autonomy engine' },
        ],
      },
      {
        label: 'Administration',
        glyph: '🔍',
        desc: 'Audit log & the event stream',
        items: [
          { label: 'Audit Trail', href: '/admin/audit', glyph: '🔍', desc: 'Immutable audit log browser' },
          { label: 'Events', href: '/events', glyph: '⚡', desc: 'The event stream' },
        ],
      },
    ],
  },
];

export const ALL_SUITES: Suite[] = SECTIONS.flatMap((s) => s.suites);
export const ALL_ITEMS: NavItem[] = ALL_SUITES.flatMap((s) => s.items);

/** The section that owns a suite, for breadcrumbs. */
export function findSection(suite: Suite): Section | null {
  return SECTIONS.find((sec) => sec.suites.includes(suite)) ?? null;
}

/**
 * Resolve the suite that owns a pathname. Exact item match wins; otherwise the
 * longest item-href prefix wins (so `/projects/projects/123` lights up Projects,
 * and `/amc/ppm` beats `/amc`). `/` only ever matches exactly.
 */
export function findSuite(pathname: string): Suite | null {
  let best: { suite: Suite; len: number } | null = null;
  for (const suite of ALL_SUITES) {
    for (const item of suite.items) {
      if (item.href === pathname) return suite;
      if (item.href !== '/' && pathname.startsWith(`${item.href}/`)) {
        if (!best || item.href.length > best.len) best = { suite, len: item.href.length };
      }
    }
  }
  return best?.suite ?? null;
}

/** The active tab inside a suite for a pathname — exact match or longest prefix. */
export function findActiveItem(suite: Suite, pathname: string): NavItem | null {
  let best: { item: NavItem; len: number } | null = null;
  for (const item of suite.items) {
    if (item.href === pathname) return item;
    if (item.href !== '/' && pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.len) best = { item, len: item.href.length };
    }
  }
  return best?.item ?? null;
}
