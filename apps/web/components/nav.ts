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
    items: [{ label: 'My Work', href: '/', glyph: '◆', desc: 'Your live workspace' }],
  },
  {
    title: 'Deal chain',
    items: [
      { label: 'Accounts', href: '/crm/accounts', glyph: '◎', desc: 'CRM — customers & prospects' },
      { label: 'Sales Pipeline', href: '/crm/leads', glyph: '⌥', desc: 'CRM — leads & opportunities' },
      { label: 'Tenders', href: '/tendering/tenders', glyph: '◳', desc: 'Bids & proposals' },
      { label: 'Contracts', href: '/contracts/contracts', glyph: '▦', desc: 'Awarded engagements' },
      { label: 'Projects', href: '/projects/projects', glyph: '▥', desc: 'Delivery & execution' },
    ],
  },
  {
    title: 'Operate',
    items: [
      { label: 'Purchase requests', href: '/procurement/purchase-requests', glyph: '▤', desc: 'Procurement request & approval' },
      { label: 'RFQs', href: '/procurement/rfqs', glyph: '◷', desc: 'Vendor quotations & bid comparison' },
      { label: 'Purchase orders', href: '/procurement/purchase-orders', glyph: '▣', desc: 'Procurement spend' },
      { label: 'Goods receipts', href: '/inventory/grns', glyph: '▢', desc: 'Inventory — received vs POs' },
      { label: 'Stock', href: '/inventory/stock', glyph: '▦', desc: 'Inventory — on-hand & movements' },
      { label: 'Transfers', href: '/inventory/transfers', glyph: '⇄', desc: 'Inventory — warehouse-to-warehouse' },
      { label: 'Engineering', href: '/engineering', glyph: '⚙', desc: 'Shop drawings, RFIs, & submittals' },
      { label: 'Site Control', href: '/site/control', glyph: '▤', desc: 'Site diaries, delay logs, & material consumption' },
      { label: 'HSE Control', href: '/hse/control', glyph: '🛡', desc: 'Safety incident logs, permits to work, & CAPA' },
      { label: 'Quality Control', href: '/quality/control', glyph: '✓', desc: 'Non-conformance reports, inspections, & snags' },
      { label: 'HR & Payroll', href: '/hr/control', glyph: '👤', desc: 'Employee profiles, leave logs, & payroll processing' },
      { label: 'Gratuity (EOSB)', href: '/hr/eosb', glyph: '◷', desc: 'End-of-service benefit calculator' },
      { label: 'Fleet & Logistics', href: '/fleet/control', glyph: '🚚', desc: 'Vehicles, equipment fleet, fuel logs, & maintenance' },
      { label: 'Assets & Equipment', href: '/assets/control', glyph: '🔧', desc: 'Asset register, calibration, inspections, & warranties' },
      { label: 'AMC & Services', href: '/amc', glyph: '⚙', desc: 'Service contracts, support tickets, & SLA timers' },
      { label: 'Invoices', href: '/finance/invoices', glyph: '◰', desc: 'Finance — supplier invoices' },
      { label: 'Subcontracts', href: '/subcontracts/subcontracts', glyph: '▧', desc: 'Subcontractor agreements & claims' },
      { label: 'Ledger & COA', href: '/finance/ledger', glyph: '◳', desc: 'Finance — double-entry general ledger' },
      { label: 'Tax & VAT Filings', href: '/finance/tax', glyph: '◲', desc: 'Finance — tax codes & quarterly VAT returns' },
      { label: 'VAT Returns', href: '/finance/vat-returns', glyph: '◱', desc: 'Finance — periodic VAT return filing' },
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
      { label: 'Templates', href: '/admin/templates', glyph: '⧇', desc: 'DMS — visual print templates' },
      { label: 'Audit Trail', href: '/admin/audit', glyph: '🔍', desc: 'Immutable audit log browser' },
      { label: 'Events', href: '/events', glyph: '⚡', desc: 'The event stream' },
    ],
  },
];

export const ALL_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
