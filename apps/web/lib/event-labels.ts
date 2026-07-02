/**
 * Product-language layer for spine events. Domain event types are machine codes
 * (`crm.opportunity.stage_changed`); end users see a readable sentence instead
 * ("Opportunity stage changed"). Derivation is generic so new modules/events get a
 * reasonable label with zero registration; AREA_LABELS only overrides the module name.
 */

const AREA_LABELS: Record<string, string> = {
  crm: 'CRM',
  tendering: 'Tendering',
  contracts: 'Contracts',
  projects: 'Projects',
  procurement: 'Procurement',
  finance: 'Finance',
  subcontracts: 'Subcontracts',
  inventory: 'Inventory',
  hr: 'HR',
  hse: 'HSE',
  quality: 'Quality',
  assets: 'Assets',
  fleet: 'Fleet',
  amc: 'AMC',
  site: 'Site',
  engineering: 'Engineering',
  doccontrol: 'Document Control',
  documents: 'Documents',
  workflow: 'Workflow',
  intelligence: 'Intelligence',
  auth: 'Access',
};

export function areaLabel(area: string): string {
  return AREA_LABELS[area] ?? capitalize(area);
}

export interface EventLabel {
  /** Module display name, e.g. "CRM". */
  area: string;
  /** Human sentence, e.g. "Opportunity stage changed". */
  label: string;
}

/** `crm.opportunity.stage_changed` → { area: "CRM", label: "Opportunity stage changed" }. */
export function humanizeEventType(type: string): EventLabel {
  const parts = type.split('.').filter(Boolean);
  if (parts.length < 2) return { area: areaLabel(parts[0] ?? type), label: capitalize(type) };
  const area = areaLabel(parts[0]);
  const words = parts
    .slice(1)
    .flatMap((p) => p.split('_'))
    .filter(Boolean);
  const label = capitalize(words.join(' '));
  return { area, label };
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
