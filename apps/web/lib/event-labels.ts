// Turns internal event types (e.g. `crm.opportunity.stage_changed`) into
// product-language labels for end users (e.g. "Opportunity stage changed").
// Used by the activity feed and anywhere raw event types would otherwise leak.

/** Module (first segment of the event type) → human label + glyph. */
const MODULE_META: Record<string, { label: string; glyph: string }> = {
  crm: { label: 'CRM', glyph: '◎' },
  tendering: { label: 'Tendering', glyph: '◳' },
  contracts: { label: 'Contracts', glyph: '▦' },
  projects: { label: 'Projects', glyph: '▥' },
  subcontracts: { label: 'Subcontracts', glyph: '▧' },
  procurement: { label: 'Procurement', glyph: '▣' },
  inventory: { label: 'Inventory', glyph: '▦' },
  finance: { label: 'Finance', glyph: '◰' },
  hr: { label: 'HR', glyph: '👤' },
  hse: { label: 'HSE', glyph: '🛡' },
  quality: { label: 'Quality', glyph: '✓' },
  fleet: { label: 'Fleet', glyph: '🚚' },
  assets: { label: 'Assets', glyph: '🔧' },
  amc: { label: 'AMC', glyph: '♺' },
  engineering: { label: 'Engineering', glyph: '⚙' },
  site: { label: 'Site', glyph: '▤' },
  doccontrol: { label: 'Documents', glyph: '▤' },
  documents: { label: 'Documents', glyph: '▤' },
  intelligence: { label: 'Intelligence', glyph: '✶' },
  workflow: { label: 'Workflow', glyph: '⚡' },
};

/** Verb (last segment) → past-tense phrase. */
const VERB_LABEL: Record<string, string> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  changed: 'changed',
  stage_changed: 'stage changed',
  status_changed: 'status changed',
  approved: 'approved',
  rejected: 'rejected',
  submitted: 'submitted',
  posted: 'posted',
  paid: 'paid',
  issued: 'issued',
  received: 'received',
  won: 'won',
  lost: 'lost',
  closed: 'closed',
  cancelled: 'cancelled',
  completed: 'completed',
};

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function moduleOf(type: string): string {
  return type.split('.')[0] ?? '';
}

export function moduleLabel(type: string): string {
  const key = moduleOf(type);
  return MODULE_META[key]?.label ?? titleCase(key);
}

export function moduleGlyph(type: string): string {
  return MODULE_META[moduleOf(type)]?.glyph ?? '•';
}

/**
 * Human phrase for an event type. `crm.opportunity.stage_changed` →
 * "Opportunity stage changed". Falls back to title-cased segments.
 */
export function eventLabel(type: string): string {
  const parts = type.split('.');
  if (parts.length < 2) return titleCase(type);
  const verb = parts[parts.length - 1];
  const entity = parts.slice(1, -1).join(' ') || parts[0];
  const verbText = VERB_LABEL[verb] ?? titleCase(verb).toLowerCase();
  return `${titleCase(entity)} ${verbText}`;
}
