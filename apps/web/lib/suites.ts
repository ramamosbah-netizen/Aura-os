import { ALL_ITEMS, type NavItem } from '@/components/nav';

export type CapabilityStatus = 'IMPLEMENTED' | 'PARTIALLY IMPLEMENTED' | 'UI MISSING' | 'NOT IMPLEMENTED' | 'NOT VERIFIED';

/** Where a suite sits in the sidebar. Work centers and System are not ordinary business suites. */
export type SuiteSection = 'work' | 'business' | 'system';

export interface AuraSuite {
  id: string;
  name: string;
  shortName: string;
  glyph: string;
  description: string;
  entryHref: string;
  section: SuiteSection;
  gate: string | null;
  adminOnly?: boolean;
  capabilities: Array<{ label: string; status: CapabilityStatus }>;
  featured?: Array<{ label: string; description: string; href?: string; status: CapabilityStatus; glyph: string }>;
  owns: (href: string) => boolean;
}

const starts = (...prefixes: string[]) => (href: string) => prefixes.some((prefix) => href === prefix || href.startsWith(`${prefix}/`));
const exact = (...routes: string[]) => (href: string) => routes.includes(href);

/**
 * AURA OS navigation taxonomy — the single source of truth for the sidebar.
 *
 * Two work centers (My Work, Communication) that serve EVERY suite, nine business suites in a
 * fixed order, and one system area (Admin). Each entry is a front door: `entryHref` opens the
 * suite's real Home; `owns(pathname)` decides which suite stays highlighted even on a deep record
 * page (e.g. `/tendering/tenders/123/pricing` keeps Pre-Award active). `owns` sets are kept mutually
 * exclusive so exactly one suite claims any path — that is what makes deep-page highlighting correct
 * (note Project Delivery owns `/projects/*` EXCEPT `/projects/variations`, which is Commercial).
 *
 * These compose existing routes and permissions; they are deliberately not backend modules and do
 * not own domain state.
 */
export const AURA_SUITES: AuraSuite[] = [
  // ── Work centers (cross-suite; pinned above the business suites) ──
  {
    id: 'my-work', name: 'My Work', shortName: 'My Work', glyph: '◆', section: 'work',
    description: 'Your personal command center — priorities, tasks, approvals and daily focus, composed from every suite.',
    entryHref: '/my-work', gate: null,
    capabilities: [{ label: 'Attention queue', status: 'IMPLEMENTED' }, { label: 'Tasks & My Day', status: 'PARTIALLY IMPLEMENTED' }, { label: 'Approvals', status: 'IMPLEMENTED' }, { label: 'Notifications & saved views', status: 'IMPLEMENTED' }],
    owns: (href) => exact('/', '/my-work', '/my-work/my-day', '/my-work/tasks', '/my-work/approvals', '/my-work/favorites', '/my-work/command-center', '/inbox', '/notifications', '/views', '/search', '/ai')(href),
  },
  {
    id: 'communication', name: 'Communication', shortName: 'Communication', glyph: '✉', section: 'work',
    description: 'The shared communication center — internal chat, mail, meetings and file sharing for every suite.',
    // Same destination as My Work → Communication, so the two never diverge.
    entryHref: '/my-work/communication', gate: null,
    capabilities: [{ label: 'Internal chat', status: 'IMPLEMENTED' }, { label: 'Mail', status: 'PARTIALLY IMPLEMENTED' }, { label: 'WhatsApp', status: 'NOT IMPLEMENTED' }, { label: 'Meetings', status: 'PARTIALLY IMPLEMENTED' }],
    owns: (href) => href === '/my-work/communication' || starts('/workspace')(href),
  },

  // ── Business suites (fixed order) ──
  {
    id: 'sales', name: 'Sales', shortName: 'Sales', glyph: '◎', section: 'business',
    description: 'Lead → Opportunity → Client → Quote → Win/Loss. Direct commercial sales before award.',
    entryHref: '/crm/overview', gate: 'suite.dealChain',
    capabilities: [{ label: 'Leads & Opportunities', status: 'IMPLEMENTED' }, { label: 'Clients & Contacts', status: 'IMPLEMENTED' }, { label: 'Quotations', status: 'IMPLEMENTED' }, { label: 'Pipeline & Forecast', status: 'IMPLEMENTED' }],
    owns: starts('/crm'),
  },
  {
    id: 'pre-award', name: 'Pre-Award', shortName: 'Pre-Award', glyph: '◳', section: 'business',
    description: 'Win the work: Tender → Bid/No-Bid → Estimation & Pricing → Submission → Win/Loss.',
    entryHref: '/tendering', gate: 'suite.dealChain',
    capabilities: [{ label: 'Tenders', status: 'IMPLEMENTED' }, { label: 'BOQ & Estimation', status: 'IMPLEMENTED' }, { label: 'Pricing & Margin', status: 'IMPLEMENTED' }, { label: 'Submissions & Outcomes', status: 'IMPLEMENTED' }],
    owns: starts('/tendering'),
  },
  {
    id: 'project-delivery', name: 'Project Delivery', shortName: 'Delivery', glyph: '▥', section: 'business',
    description: 'Execute and hand over won projects: Project 360, Engineering, Site, Quality, HSE, Commissioning, Handover.',
    entryHref: '/projects/dashboard', gate: 'suite.dealChain',
    capabilities: [{ label: 'Portfolio & Project 360', status: 'IMPLEMENTED' }, { label: 'Engineering & Site', status: 'IMPLEMENTED' }, { label: 'Quality & HSE', status: 'IMPLEMENTED' }, { label: 'Commissioning & Handover', status: 'IMPLEMENTED' }],
    owns: (href) => starts('/projects', '/project', '/engineering', '/site', '/quality', '/hse', '/commissioning', '/handover', '/compliance', '/doccontrol')(href) && !starts('/projects/variations')(href),
  },
  {
    id: 'commercial', name: 'Commercial', shortName: 'Commercial', glyph: '§', section: 'business',
    description: 'Post-award commercial control: contracts, variations, claims, certificates and subcontracts.',
    entryHref: '/contracts', gate: 'suite.dealChain',
    capabilities: [{ label: 'Contracts & clauses', status: 'IMPLEMENTED' }, { label: 'Variations & EOT', status: 'IMPLEMENTED' }, { label: 'Payment certificates', status: 'IMPLEMENTED' }, { label: 'Subcontracts & claims', status: 'IMPLEMENTED' }],
    owns: (href) => starts('/contracts', '/subcontracts')(href) || starts('/projects/variations')(href),
  },
  {
    id: 'supply-chain', name: 'Supply Chain', shortName: 'Supply Chain', glyph: '◈', section: 'business',
    description: 'Procurement, supplier comparison, purchasing, receiving and inventory control.',
    entryHref: '/procurement', gate: 'suite.operate',
    capabilities: [{ label: 'Purchase requests & approvals', status: 'IMPLEMENTED' }, { label: 'RFQ comparison', status: 'IMPLEMENTED' }, { label: 'Purchase orders & 3-way match', status: 'IMPLEMENTED' }, { label: 'Inventory & serials', status: 'IMPLEMENTED' }],
    owns: starts('/procurement', '/inventory'),
  },
  {
    id: 'finance', name: 'Finance', shortName: 'Finance', glyph: '◳', section: 'business',
    description: 'Receivables, payables, ledger, close, tax, treasury and project financial views.',
    entryHref: '/finance', gate: 'suite.operate',
    capabilities: [{ label: 'AR / AP', status: 'IMPLEMENTED' }, { label: 'Ledger & statements', status: 'IMPLEMENTED' }, { label: 'Budget & revenue recognition', status: 'IMPLEMENTED' }, { label: 'Tax, treasury & reconciliation', status: 'IMPLEMENTED' }],
    owns: starts('/finance'),
  },
  {
    id: 'assets-service', name: 'Assets & Service', shortName: 'Assets & Service', glyph: '♺', section: 'business',
    description: 'Operational assets, fleet, warranty, maintenance contracts and field service.',
    entryHref: '/assets', gate: 'suite.operate',
    capabilities: [{ label: 'Asset register & lifecycle', status: 'IMPLEMENTED' }, { label: 'Fleet & equipment', status: 'IMPLEMENTED' }, { label: 'AMC & SLA', status: 'IMPLEMENTED' }, { label: 'Field dispatch & PPM', status: 'IMPLEMENTED' }],
    owns: starts('/assets', '/fleet', '/amc'),
  },
  {
    id: 'people', name: 'People', shortName: 'People', glyph: '👤', section: 'business',
    description: 'People records, time, attendance, payroll, performance and employee compliance.',
    entryHref: '/hr', gate: 'suite.operate',
    capabilities: [{ label: 'People & payroll', status: 'IMPLEMENTED' }, { label: 'Time & attendance', status: 'IMPLEMENTED' }, { label: 'Performance & expenses', status: 'IMPLEMENTED' }, { label: 'Document expiry compliance', status: 'IMPLEMENTED' }],
    owns: starts('/hr'),
  },
  {
    id: 'intelligence', name: 'Intelligence', shortName: 'Intelligence', glyph: '✶', section: 'business',
    description: 'Cross-domain signals, reporting, AI briefings and governed decision support.',
    entryHref: '/intelligence', gate: 'suite.intelligence',
    capabilities: [{ label: 'Operational insights', status: 'IMPLEMENTED' }, { label: 'Cross-domain search', status: 'IMPLEMENTED' }, { label: 'Read-only AI assistance', status: 'PARTIALLY IMPLEMENTED' }, { label: 'Governed proposals/actions', status: 'PARTIALLY IMPLEMENTED' }],
    owns: starts('/intelligence'),
  },

  // ── System ──
  {
    id: 'administration-governance', name: 'Admin Center', shortName: 'Admin', glyph: '🛠', section: 'system',
    description: 'Access, organization, policies, integrations, audit and platform operations.',
    entryHref: '/admin', gate: 'suite.platform', adminOnly: true,
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

/** Sidebar model: visible suites grouped into their three sections, order preserved. */
export function suiteSections(allowed: string[] | null | undefined, isAdmin: boolean): Array<{ section: SuiteSection; title: string; suites: AuraSuite[] }> {
  const visible = visibleSuites(allowed, isAdmin);
  const titles: Record<SuiteSection, string> = { work: 'My Work', business: 'Business Suites', system: 'System' };
  return (['work', 'business', 'system'] as SuiteSection[])
    .map((section) => ({ section, title: titles[section], suites: visible.filter((suite) => suite.section === section) }))
    .filter((group) => group.suites.length > 0);
}

/** The suite that owns a pathname — used to keep the sidebar highlighted on deep pages. */
export function activeSuite(pathname: string): AuraSuite | null {
  return AURA_SUITES.find((suite) => suite.owns(pathname)) ?? null;
}

export function suiteFunctions(suite: AuraSuite): NavItem[] {
  const seen = new Set<string>();
  return ALL_ITEMS.filter((item) => suite.owns(item.href) && !seen.has(item.href) && !!seen.add(item.href));
}

export function findSuite(id: string): AuraSuite | null {
  return AURA_SUITES.find((suite) => suite.id === id) ?? null;
}
