import { ALL_ITEMS, type NavItem } from '@/components/nav';

export type CapabilityStatus = 'IMPLEMENTED' | 'PARTIALLY IMPLEMENTED' | 'UI MISSING' | 'NOT IMPLEMENTED' | 'NOT VERIFIED';

export interface AuraSuite {
  id: string;
  name: string;
  shortName: string;
  glyph: string;
  description: string;
  entryHref: string;
  gate: string | null;
  adminOnly?: boolean;
  capabilities: Array<{ label: string; status: CapabilityStatus }>;
  featured?: Array<{ label: string; description: string; href?: string; status: CapabilityStatus; glyph: string }>;
  owns: (href: string) => boolean;
}

const starts = (...prefixes: string[]) => (href: string) => prefixes.some((prefix) => href === prefix || href.startsWith(`${prefix}/`));
const exact = (...routes: string[]) => (href: string) => routes.includes(href);

/**
 * Product-navigation suites only. They compose existing routes and permissions; they
 * are deliberately not backend modules and do not own domain state.
 */
export const AURA_SUITES: AuraSuite[] = [
  {
    id: 'workplace-collaboration', name: 'Workplace & Collaboration', shortName: 'Workplace', glyph: '◆',
    description: 'Personal work, decisions, communication, documents and reusable views.', entryHref: '/my-work', gate: null,
    capabilities: [
      { label: 'My Work', status: 'IMPLEMENTED' }, { label: 'Tasks', status: 'PARTIALLY IMPLEMENTED' },
      { label: 'Calendar', status: 'PARTIALLY IMPLEMENTED' }, { label: 'Meetings & MOM', status: 'PARTIALLY IMPLEMENTED' },
      { label: 'Communications', status: 'PARTIALLY IMPLEMENTED' }, { label: 'Email integration', status: 'NOT VERIFIED' },
      { label: 'WhatsApp integration', status: 'NOT IMPLEMENTED' }, { label: 'Documents & versions', status: 'IMPLEMENTED' },
      { label: 'Contacts', status: 'IMPLEMENTED' }, { label: 'Notes workspace', status: 'NOT IMPLEMENTED' },
      { label: 'Sharing & related records', status: 'PARTIALLY IMPLEMENTED' }, { label: 'Notifications', status: 'IMPLEMENTED' },
      { label: 'Saved views', status: 'IMPLEMENTED' },
    ],
    featured: [
      { label: 'My Work', description: 'Your live priorities, decisions and next actions.', href: '/my-work', status: 'IMPLEMENTED', glyph: '◆' },
      { label: 'Communications', description: 'Internal chat, mail and team channels.', href: '/workspace?tab=chat', status: 'PARTIALLY IMPLEMENTED', glyph: '✉' },
      { label: 'Contacts', description: 'People and relationship records from the live CRM.', href: '/crm/contacts', status: 'IMPLEMENTED', glyph: '☎' },
      { label: 'My Day', description: 'Cross-module daily focus, appointments and dated work; full calendar planning remains partial.', href: '/my-work/my-day', status: 'PARTIALLY IMPLEMENTED', glyph: '▦' },
      { label: 'Meetings & MOM', description: 'Activities exist; agenda, decisions and formal minutes are incomplete.', href: '/crm/activities', status: 'PARTIALLY IMPLEMENTED', glyph: '◐' },
      { label: 'Notes', description: 'Target Notion-style knowledge workspace; persistence and collaboration are not implemented.', status: 'NOT IMPLEMENTED', glyph: '✎' },
    ],
    owns: (href) => exact('/', '/my-work', '/my-work/my-day', '/workspace', '/inbox', '/notifications', '/views', '/search', '/ai', '/crm/activities', '/crm/contacts', '/documents', '/documents/control')(href),
  },
  {
    id: 'sales-pre-award', name: 'Sales & Pre-Award', shortName: 'Sales', glyph: '◎',
    description: 'Lead-to-award flow from opportunity and requirements through pricing, quotation and negotiation.', entryHref: '/crm/overview', gate: 'suite.dealChain',
    capabilities: [{ label: 'Lead → Opportunity → Requirements', status: 'IMPLEMENTED' }, { label: 'Estimate / BOQ / Pricing', status: 'IMPLEMENTED' }, { label: 'Quotation revisions & negotiation', status: 'IMPLEMENTED' }, { label: 'Won → Contract → Project', status: 'IMPLEMENTED' }],
    owns: starts('/crm', '/tendering'),
  },
  {
    id: 'project-delivery', name: 'Project Delivery', shortName: 'Delivery', glyph: '▥',
    description: 'Project 360 context across engineering, execution, quality, HSE, commissioning and handover.', entryHref: '/projects/dashboard', gate: 'suite.dealChain',
    capabilities: [{ label: 'Portfolio & Project 360', status: 'IMPLEMENTED' }, { label: 'Engineering', status: 'IMPLEMENTED' }, { label: 'Site execution', status: 'IMPLEMENTED' }, { label: 'Quality & HSE', status: 'IMPLEMENTED' }, { label: 'Commissioning & handover links', status: 'IMPLEMENTED' }],
    owns: (href) => starts('/projects', '/project', '/engineering', '/site', '/quality', '/hse', '/commissioning', '/handover', '/compliance', '/doccontrol')(href) && href !== '/projects/variations',
  },
  {
    id: 'commercial-contracts', name: 'Commercial & Contracts', shortName: 'Commercial', glyph: '§',
    description: 'Contract value, changes, certificates, claims and subcontract commercial control.', entryHref: '/contracts/contracts', gate: 'suite.dealChain',
    capabilities: [{ label: 'Contracts & clauses', status: 'IMPLEMENTED' }, { label: 'Variations & EOT', status: 'IMPLEMENTED' }, { label: 'Payment certificates', status: 'IMPLEMENTED' }, { label: 'Subcontracts & claims', status: 'IMPLEMENTED' }, { label: 'Reusable comparison experience', status: 'PARTIALLY IMPLEMENTED' }],
    owns: (href) => starts('/contracts', '/subcontracts')(href) || href === '/projects/variations',
  },
  {
    id: 'supply-chain', name: 'Supply Chain', shortName: 'Supply Chain', glyph: '◈',
    description: 'Procurement, supplier comparisons, purchasing, receiving and inventory control.', entryHref: '/procurement/dashboard', gate: 'suite.operate',
    capabilities: [{ label: 'Purchase requests & approvals', status: 'IMPLEMENTED' }, { label: 'RFQ comparison', status: 'IMPLEMENTED' }, { label: 'Purchase orders & 3-way match', status: 'IMPLEMENTED' }, { label: 'Inventory & serial tracking', status: 'IMPLEMENTED' }],
    owns: starts('/procurement', '/inventory'),
  },
  {
    id: 'finance', name: 'Finance', shortName: 'Finance', glyph: '◳',
    description: 'Receivables, payables, ledgers, close, tax, treasury and project financial views.', entryHref: '/finance/dashboard', gate: 'suite.operate',
    capabilities: [{ label: 'AR / AP', status: 'IMPLEMENTED' }, { label: 'Ledger & statements', status: 'IMPLEMENTED' }, { label: 'Budget & revenue recognition', status: 'IMPLEMENTED' }, { label: 'Tax, treasury & reconciliation', status: 'IMPLEMENTED' }],
    owns: starts('/finance'),
  },
  {
    id: 'assets-service', name: 'Assets & Service', shortName: 'Assets & Service', glyph: '♺',
    description: 'Operational assets, fleet, warranty, maintenance contracts and field service.', entryHref: '/assets/control', gate: 'suite.operate',
    capabilities: [{ label: 'Asset register & lifecycle', status: 'IMPLEMENTED' }, { label: 'Fleet & equipment', status: 'IMPLEMENTED' }, { label: 'AMC & SLA', status: 'IMPLEMENTED' }, { label: 'Field dispatch & PPM', status: 'IMPLEMENTED' }],
    owns: starts('/assets', '/fleet', '/amc'),
  },
  {
    id: 'people-organization', name: 'People & Organization', shortName: 'People', glyph: '👤',
    description: 'People records, time, attendance, payroll, performance and employee compliance.', entryHref: '/hr/dashboard', gate: 'suite.operate',
    capabilities: [{ label: 'People & payroll', status: 'IMPLEMENTED' }, { label: 'Time & attendance', status: 'IMPLEMENTED' }, { label: 'Performance & expenses', status: 'IMPLEMENTED' }, { label: 'Document expiry compliance', status: 'IMPLEMENTED' }],
    owns: starts('/hr'),
  },
  {
    id: 'intelligence-reporting', name: 'Intelligence & Reporting', shortName: 'Intelligence', glyph: '✶',
    description: 'Cross-domain signals, reporting, AI briefings and governed decision support.', entryHref: '/intelligence', gate: 'suite.intelligence',
    capabilities: [{ label: 'Operational insights', status: 'IMPLEMENTED' }, { label: 'Cross-domain search', status: 'IMPLEMENTED' }, { label: 'Read-only AI assistance', status: 'PARTIALLY IMPLEMENTED' }, { label: 'Governed proposals/actions', status: 'PARTIALLY IMPLEMENTED' }],
    owns: starts('/intelligence'),
  },
  {
    id: 'administration-governance', name: 'Administration & Governance', shortName: 'Administration', glyph: '🛠',
    description: 'Access, organization, policies, integrations, audit and platform operations.', entryHref: '/admin', gate: 'suite.platform', adminOnly: true,
    capabilities: [{ label: 'Roles & access', status: 'IMPLEMENTED' }, { label: 'Approval policies', status: 'IMPLEMENTED' }, { label: 'Integrations & feature flags', status: 'IMPLEMENTED' }, { label: 'Audit & observability', status: 'IMPLEMENTED' }],
    owns: (href) => starts('/admin')(href) || href === '/events',
  },
];

export function visibleSuites(allowed: string[] | null | undefined, isAdmin: boolean): AuraSuite[] {
  const gates = allowed == null ? null : new Set(allowed);
  return AURA_SUITES.filter((suite) => {
    if (suite.adminOnly && !isAdmin) return false;
    return isAdmin || !suite.gate || gates == null || gates.has(suite.gate);
  });
}

export function suiteFunctions(suite: AuraSuite): NavItem[] {
  const seen = new Set<string>();
  return ALL_ITEMS.filter((item) => suite.owns(item.href) && !seen.has(item.href) && !!seen.add(item.href));
}

export function findSuite(id: string): AuraSuite | null {
  return AURA_SUITES.find((suite) => suite.id === id) ?? null;
}
