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
      { label: 'Tenders', href: '/tendering/tenders', glyph: '◳', desc: 'Bids & proposals' },
      { label: 'Contracts', href: '/contracts/contracts', glyph: '▦', desc: 'Awarded engagements' },
      { label: 'Projects', href: '/projects/projects', glyph: '▥', desc: 'Delivery & execution' },
    ],
  },
  {
    title: 'Operate',
    items: [
      { label: 'Purchase orders', href: '/procurement/purchase-orders', glyph: '▣', desc: 'Procurement spend' },
      { label: 'Goods receipts', href: '/inventory/grns', glyph: '▢', desc: 'Inventory — received vs POs' },
      { label: 'Invoices', href: '/finance/invoices', glyph: '◰', desc: 'Finance — supplier invoices' },
    ],
  },
  {
    title: 'Intelligence',
    items: [{ label: 'Insights', href: '/intelligence', glyph: '✶', desc: 'AI briefing & pipeline' }],
  },
  {
    title: 'Platform',
    items: [
      { label: 'Documents', href: '/documents', glyph: '▤', desc: 'DMS — versioned documents' },
      { label: 'Events', href: '/events', glyph: '⚡', desc: 'The event stream' },
    ],
  },
];

export const ALL_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
