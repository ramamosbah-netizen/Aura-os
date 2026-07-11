// Registry of Administration Center sections. Drives the /admin hub tiles, the
// per-page back-link, and keeps titles/descriptions in one place so the hub and
// the pages never drift. Server-safe (no client code).

export interface AdminSection {
  key: string;
  href: string;
  glyph: string;
  title: string;
  desc: string;
  group: 'Governance' | 'Configuration' | 'Integration' | 'Observability';
}

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    key: 'organization',
    href: '/admin/organization',
    glyph: '🏢',
    title: 'Organization',
    desc: 'Company identity, finance defaults, and locale — the guided profile.',
    group: 'Configuration',
  },
  {
    key: 'users',
    href: '/admin/users',
    glyph: '👥',
    title: 'Users',
    desc: 'Register, deactivate, and assign users — enforced at login and API.',
    group: 'Governance',
  },
  {
    key: 'access',
    href: '/admin/access',
    glyph: '🔐',
    title: 'Roles & Access',
    desc: 'Permission matrix and per-user grants that the API guard enforces.',
    group: 'Governance',
  },
  {
    key: 'security',
    href: '/admin/security',
    glyph: '🛡',
    title: 'Security Posture',
    desc: 'Auth mode, lockout policy, MFA enrolments, SSO, and PII crypto.',
    group: 'Governance',
  },
  {
    key: 'workflows',
    href: '/admin/workflows',
    glyph: '🔀',
    title: 'Workflow Registry',
    desc: 'Registered approval workflows, their states, and live instances.',
    group: 'Governance',
  },
  {
    key: 'approval-matrix',
    href: '/admin/approval-matrix',
    glyph: '⚖',
    title: 'Approval Matrix',
    desc: 'Threshold rules deciding who must approve each document type.',
    group: 'Governance',
  },
  {
    key: 'workspace',
    href: '/admin/workspace',
    glyph: '🛠',
    title: 'Workspace Access',
    desc: 'Map roles to the functions and suites each user can see.',
    group: 'Governance',
  },
  {
    key: 'modules',
    href: '/admin/modules',
    glyph: '🧩',
    title: 'Module Manager',
    desc: 'Switch business modules on/off — enforced in nav and API.',
    group: 'Configuration',
  },
  {
    key: 'module-settings',
    href: '/admin/module-settings',
    glyph: '🎛',
    title: 'Module Settings',
    desc: 'Business defaults per module: rates, thresholds, stages, policies.',
    group: 'Configuration',
  },
  {
    key: 'settings',
    href: '/admin/settings',
    glyph: '⚙',
    title: 'Organisation Settings',
    desc: 'Per-tenant key/value configuration modules read at runtime.',
    group: 'Configuration',
  },
  {
    key: 'feature-flags',
    href: '/admin/feature-flags',
    glyph: '🚩',
    title: 'Feature Flags',
    desc: 'Stage and roll out capabilities with per-tenant overrides.',
    group: 'Configuration',
  },
  {
    key: 'numbering',
    href: '/admin/numbering',
    glyph: '#',
    title: 'Document Numbering',
    desc: 'Gapless per-year sequences, prefixes, and padding per document type.',
    group: 'Configuration',
  },
  {
    key: 'calendar',
    href: '/admin/calendar',
    glyph: '🗓',
    title: 'Business Calendar',
    desc: 'Working days, public holidays, and Ramadan-hour adjustments.',
    group: 'Configuration',
  },
  {
    key: 'forms',
    href: '/admin/forms',
    glyph: '📝',
    title: 'Form Designer',
    desc: 'Rename, hide, and re-require form fields — enforced end to end.',
    group: 'Configuration',
  },
  {
    key: 'templates',
    href: '/admin/templates',
    glyph: '⧇',
    title: 'Print Templates',
    desc: 'Visual builder for versioned document and print templates.',
    group: 'Configuration',
  },
  {
    key: 'connectors',
    href: '/admin/connectors',
    glyph: '🔌',
    title: 'Connectors',
    desc: 'Outbound links to ERP, e-invoicing, and bank-feed systems.',
    group: 'Integration',
  },
  {
    key: 'webhooks',
    href: '/admin/webhooks',
    glyph: '📡',
    title: 'Webhooks',
    desc: 'Signed event delivery to your endpoints, with a delivery log.',
    group: 'Integration',
  },
  {
    key: 'notifications',
    href: '/admin/notifications',
    glyph: '📮',
    title: 'Notification Routing',
    desc: 'Channel defaults, per-user recipients, and event wirings.',
    group: 'Integration',
  },
  {
    key: 'data',
    href: '/admin/data',
    glyph: '🗄',
    title: 'Data Administration',
    desc: 'Demo seed, CSV exports for BI, and chart-of-accounts import.',
    group: 'Configuration',
  },
  {
    key: 'health',
    href: '/admin/health',
    glyph: '🩺',
    title: 'Platform Health',
    desc: 'Event spine depth, dead letters, and webhook delivery health.',
    group: 'Observability',
  },
  {
    key: 'audit',
    href: '/admin/audit',
    glyph: '🔍',
    title: 'Audit Trail',
    desc: 'Immutable log of every privileged action across the platform.',
    group: 'Observability',
  },
  {
    key: 'ai',
    href: '/admin/ai',
    glyph: '🤖',
    title: 'AI Administration',
    desc: 'Provider seam, guardrail toggles, and the autonomy queue.',
    group: 'Governance',
  },
  {
    key: 'intelligence',
    href: '/admin/intelligence',
    glyph: '⚡',
    title: 'Intelligence Console',
    desc: 'IEC pricing, autonomy proposals, and the insight engine.',
    group: 'Observability',
  },
];

export const ADMIN_GROUPS: AdminSection['group'][] = [
  'Governance',
  'Configuration',
  'Integration',
  'Observability',
];
