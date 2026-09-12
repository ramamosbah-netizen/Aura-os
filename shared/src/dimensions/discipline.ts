// Canonical `discipline` — a shared platform dimension (ADR-0012, Shared Dimensions). Promoted
// here from the Engineering module on its SECOND consumer (Procurement) per the Rule of Three:
// once ≥2 bounded contexts tag records by discipline, the vocabulary must have one home both can
// import — and a business module can't import another (ADR-0004), so it lives in @aura/shared.
//
// Every aggregate that carries a discipline (drawings, RFIs, submittals, TQs, BIM models,
// engineering documents, POs, PRs, …) uses THIS set so filters, KPIs, assignment and ABAC speak
// one vocabulary. Superset: fine-grained construction trades + legacy coarse buckets
// ('mep', 'coordination') so existing data stays valid.

export type Discipline =
  | 'architectural'
  | 'structural'
  | 'civil'
  | 'mechanical'
  | 'electrical'
  | 'plumbing'
  | 'hvac'
  | 'fire_fighting'
  | 'fire_alarm'
  | 'elv'
  | 'ict'
  | 'security'
  | 'cctv'
  | 'access_control'
  | 'bms'
  | 'mep'
  | 'coordination'
  | 'other';

export const DISCIPLINES: readonly Discipline[] = [
  'architectural', 'structural', 'civil',
  'mechanical', 'electrical', 'plumbing', 'hvac',
  'fire_fighting', 'fire_alarm',
  'elv', 'ict', 'security', 'cctv', 'access_control', 'bms',
  'mep', 'coordination', 'other',
] as const;

export const DEFAULT_DISCIPLINE: Discipline = 'other';

/** Normalise an untrusted string to a valid Discipline, falling back to 'other'. */
export function toDiscipline(value: string | null | undefined): Discipline {
  if (!value) return DEFAULT_DISCIPLINE;
  const v = value.trim().toLowerCase();
  return (DISCIPLINES as readonly string[]).includes(v) ? (v as Discipline) : DEFAULT_DISCIPLINE;
}

/**
 * One source for labels, so API, UI and reports never drift apart — the same rule `ELV_SYSTEM_LABELS`
 * follows (TC-GATE-12).
 *
 * Added when the inspection-request form needed to offer the full vocabulary instead of its private
 * four. That form used to label `electrical` as "Electrical & ELV", which is what a screen looks like
 * when the vocabulary behind it cannot say what the business does.
 */
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  architectural: 'Architectural',
  structural: 'Structural',
  civil: 'Civil',
  mechanical: 'Mechanical',
  electrical: 'Electrical',
  plumbing: 'Plumbing & Drainage',
  hvac: 'HVAC',
  fire_fighting: 'Fire Fighting',
  fire_alarm: 'Fire Alarm',
  elv: 'ELV (general)',
  ict: 'ICT & Networks',
  security: 'Security',
  cctv: 'CCTV',
  access_control: 'Access Control',
  bms: 'BMS',
  mep: 'MEP (coordinated)',
  coordination: 'Coordination',
  other: 'Other',
};
