// Canonical engineering discipline — the shared dimension owned by the Engineering module
// (ADR-0012, Shared Dimensions). Every engineering aggregate (drawing, RFI, submittal, TQ, BIM
// model) is tagged with one discipline so filters, KPIs, engineer assignment and ABAC policies
// speak one vocabulary instead of N bespoke ones.
//
// The set is a superset: it carries the fine-grained construction trades AND the legacy coarse
// buckets ('mep', 'coordination') so existing TQ/BIM data stays valid while new aggregates use
// the precise values.

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
