/**
 * Qualification semantics.
 *
 * Today the four BANT dimensions are stored as `boolean NOT NULL DEFAULT false`, written from a
 * checkbox. That shape can only say "confirmed" or "not confirmed" — so `false` means the system
 * HAS NO CONFIRMATION, not that the customer answered no. Every existing reader agrees (the stage
 * gate raises `NEED_NOT_CONFIRMED`, the deal brief lists only the true ones), and the live event log
 * contains exactly one BANT write ever: an un-tick. There is therefore no explicit "No" anywhere in
 * the data, and mapping `false → UNKNOWN` loses nothing.
 *
 * This matters because the UI called 1/4 "early / unqualified". "Unqualified" is a JUDGEMENT — it
 * says the deal was assessed and found wanting. "Unknown" is an ABSENCE — nobody has asked yet.
 * Presenting the second as the first invents a verdict out of missing data, which is the same
 * mistake as reading an empty alert list as good health.
 *
 * The four-state model is the target shape (Phase 2 adds evidence/source/confirmedBy/confirmedAt to
 * the store). Building the enum now means the UI is written once, against the final contract, and
 * the migration later only enriches what is already being read.
 *
 * Qualification is an ASSESSMENT, never a lifecycle decision. A deal may legitimately be Qualified
 * at 2/4, or sit in review at 4/4 — a human decides that. Nothing here returns qualified/disqualified.
 */
export type QualificationStatus = 'UNKNOWN' | 'CONFIRMED' | 'CONCERN' | 'BLOCKER';

export type QualificationKey = 'budget' | 'authority' | 'need' | 'timeline';

export interface QualificationDimension {
  key: QualificationKey;
  label: string;
  status: QualificationStatus;
  /**
   * What makes this believable. `null` on a CONFIRMED dimension means somebody ticked a box and no
   * evidence was ever recorded — a confirmation nobody can audit. Kept visible rather than assumed.
   */
  evidence: string | null;
  /**
   * Phase 2 provenance. Optional because the boolean adapter cannot supply it: a dimension read
   * from the legacy checkbox has a status and nothing else, and inventing a source or a timestamp
   * for it would manufacture the exact provenance this model exists to make honest. Absent means
   * "not recorded", never "none".
   */
  source?: QualificationSource | null;
  confirmedBy?: import('./id').Id | null;
  confirmedAt?: string | null;
}

/**
 * Where a dimension's status came from. `checkbox` is its own source and is NOT a synonym for
 * "unknown provenance": it says a human ticked a box in AURA with nothing attached, which is a
 * weaker claim than a customer's own statement or a document, and the difference is the whole point
 * of recording it. A dimension whose record predates Phase 2 has NO source at all (`null`).
 */
export type QualificationSource = 'customer_stated' | 'document' | 'meeting' | 'internal_assessment' | 'checkbox';

export const QUALIFICATION_SOURCE_LABEL: Record<QualificationSource, string> = {
  customer_stated: 'Customer stated',
  document: 'Document',
  meeting: 'Meeting',
  internal_assessment: 'Internal assessment',
  checkbox: 'Checkbox only',
};

/** Coverage band. Describes how much is KNOWN — it is not a verdict on the deal. */
export type QualificationBand = 'EARLY' | 'DEVELOPING' | 'STRONG' | 'BLOCKED';

export interface QualificationView {
  dimensions: QualificationDimension[];
  total: number;
  confirmed: number;
  unknown: number;
  concerns: number;
  blockers: number;
  /** CONFIRMED dimensions carrying no evidence — assertions that cannot be checked. */
  unevidenced: number;
  band: QualificationBand;
}

export const QUALIFICATION_LABEL: Record<QualificationKey, string> = {
  budget: 'Budget',
  authority: 'Authority',
  need: 'Need',
  timeline: 'Timeline',
};

export const QUALIFICATION_STATUS_LABEL: Record<QualificationStatus, string> = {
  UNKNOWN: 'Not established',
  CONFIRMED: 'Confirmed',
  CONCERN: 'Concern',
  BLOCKER: 'Blocker',
};

export const QUALIFICATION_BAND_LABEL: Record<QualificationBand, string> = {
  EARLY: 'Early',
  DEVELOPING: 'Developing',
  STRONG: 'Strong',
  BLOCKED: 'Blocked',
};

export function summariseQualification(dimensions: QualificationDimension[]): QualificationView {
  const confirmed = dimensions.filter((d) => d.status === 'CONFIRMED').length;
  const unknown = dimensions.filter((d) => d.status === 'UNKNOWN').length;
  const concerns = dimensions.filter((d) => d.status === 'CONCERN').length;
  const blockers = dimensions.filter((d) => d.status === 'BLOCKER').length;
  const unevidenced = dimensions.filter((d) => d.status === 'CONFIRMED' && !d.evidence).length;
  const band: QualificationBand =
    blockers > 0 ? 'BLOCKED'
    : confirmed === dimensions.length && concerns === 0 ? 'STRONG'
    : confirmed <= 1 ? 'EARLY'
    : 'DEVELOPING';
  return { dimensions, total: dimensions.length, confirmed, unknown, concerns, blockers, unevidenced, band };
}

/**
 * Adapter over today's four booleans. LOSSY BY DESIGN and only in the safe direction:
 * `true → CONFIRMED` (with no evidence, because none is stored yet) and `false → UNKNOWN` — never
 * "failed". CONCERN and BLOCKER cannot arise from a boolean; they become reachable in Phase 2 when
 * the store can hold a status of its own.
 */
export function qualificationFromFlags(flags: {
  budgetConfirmed: boolean;
  authorityConfirmed: boolean;
  needConfirmed: boolean;
  timelineConfirmed: boolean;
}): QualificationView {
  const of = (key: QualificationKey, confirmed: boolean): QualificationDimension => ({
    key,
    label: QUALIFICATION_LABEL[key],
    status: confirmed ? 'CONFIRMED' : 'UNKNOWN',
    evidence: null,
  });
  return summariseQualification([
    of('budget', flags.budgetConfirmed),
    of('authority', flags.authorityConfirmed),
    of('need', flags.needConfirmed),
    of('timeline', flags.timelineConfirmed),
  ]);
}

/**
 * The sentence a user reads. It reports what is KNOWN and what is MISSING, and never calls an
 * unasked question a failure — no wording here may imply the deal was judged and rejected.
 */
export function describeQualification(view: QualificationView): string {
  const head = `${QUALIFICATION_BAND_LABEL[view.band]} — ${view.confirmed} of ${view.total} confirmed`;
  const parts: string[] = [];
  if (view.unknown > 0) parts.push(`${view.unknown} not yet established`);
  if (view.concerns > 0) parts.push(`${view.concerns} concern${view.concerns === 1 ? '' : 's'}`);
  if (view.blockers > 0) parts.push(`${view.blockers} blocker${view.blockers === 1 ? '' : 's'}`);
  return parts.length ? `${head} · ${parts.join(' · ')}.` : `${head}.`;
}
