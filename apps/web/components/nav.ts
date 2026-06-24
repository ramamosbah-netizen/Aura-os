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
    title: 'Platform',
    items: [
      { label: 'Documents', href: '/documents', glyph: '▤', desc: 'DMS — versioned documents' },
      { label: 'Events', href: '/events', glyph: '⚡', desc: 'The event stream' },
    ],
  },
];

export const ALL_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
