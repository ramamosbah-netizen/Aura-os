// G3 — the Lead Qualification Engine.
//
// The question this layer answers is NOT "is anyone chasing this?" (that is leadAttention, the
// execution discipline) and NOT "will we win?" (that is the opportunity's win probability). It is:
// **is there a real commercial opportunity here, worth investing qualification effort in?**
//
// Score ≠ Win Probability. The lead score measures the QUALITY OF QUALIFICATION — how well we
// understand and fit this inquiry. A perfectly-qualified lead can still be lost, and a barely-
// qualified one can be won. Keeping them separate is the point; conflating them into one number
// is explicitly on the "do not build" list.
//
// Deliberately mirrors the opportunity's pursuit engine (scorePursuit/recommendPursuit): same
// 0–100 dimensions, same "missing is ignored, not zero" rule, same score→recommendation shape.
// One scoring idiom in the codebase, applied at two levels — not two competing inventions.

/**
 * The eight qualification dimensions — all 0–100, higher is better.
 *
 * `informationQuality` rates the LEAD's data (do we actually know what they need?), which is not
 * the same as `coverage` below (how much of this assessment we have filled in). A lead can be
 * fully assessed and still score low on information quality — that is a real, useful signal.
 */
export const LEAD_QUALIFICATION_DIMENSIONS = [
  'fit',
  'intent',
  'needConfidence',
  'timingReadiness',
  'authorityAccess',
  'commercialPotential',
  'relationshipStrength',
  'informationQuality',
] as const;

export type LeadQualificationDimensionKey = (typeof LEAD_QUALIFICATION_DIMENSIONS)[number];
export type LeadQualificationDimensions = Partial<Record<LeadQualificationDimensionKey, number>>;

/** Human-readable labels — one source, so API, UI and explanations never drift apart. */
export const LEAD_QUALIFICATION_LABELS: Record<LeadQualificationDimensionKey, string> = {
  fit: 'Fit',
  intent: 'Intent',
  needConfidence: 'Need confidence',
  timingReadiness: 'Timing readiness',
  authorityAccess: 'Authority access',
  commercialPotential: 'Commercial potential',
  relationshipStrength: 'Relationship strength',
  informationQuality: 'Information quality',
};

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

const rated = (dimensions: LeadQualificationDimensions): LeadQualificationDimensionKey[] =>
  LEAD_QUALIFICATION_DIMENSIONS.filter((k) => {
    const v = dimensions[k];
    return typeof v === 'number' && Number.isFinite(v);
  });

/**
 * Average of the RATED dimensions (0–100). An unrated dimension is unknown, not zero — scoring it
 * as zero would punish a promising lead for not having been assessed yet, which would push people
 * to rate everything at once instead of as they learn. `confidence` is what exposes thin coverage.
 */
export function scoreLeadQualification(dimensions: LeadQualificationDimensions): number {
  const keys = rated(dimensions);
  if (keys.length === 0) return 0;
  return Math.round(keys.reduce((s, k) => s + clamp(dimensions[k] as number), 0) / keys.length);
}

export type LeadQualificationConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * How much of the assessment is actually filled in — the honesty check on the score. A score of
 * 90 from one rated dimension is not the same fact as 90 from eight, and the UI must never show
 * them identically.
 */
export function leadQualificationConfidence(dimensions: LeadQualificationDimensions): LeadQualificationConfidence {
  const n = rated(dimensions).length;
  if (n >= 6) return 'HIGH';
  if (n >= 3) return 'MEDIUM';
  return 'LOW';
}

/** What the engine advises. It never changes the lead's status — a human qualifies. */
export type LeadQualificationRecommendation = 'QUALIFY' | 'NURTURE' | 'DISQUALIFY' | 'REVIEW';

/**
 * Score → recommendation, with confidence as a gate: on LOW coverage the engine says REVIEW
 * (go and find out) rather than pretending to a verdict it has not earned. The bands mirror
 * recommendPursuit's 60/40 split, widened to a third outcome because the lead lifecycle has three
 * real exits: QUALIFIED, NURTURE, DISQUALIFIED.
 */
export function recommendLeadQualification(
  score: number,
  confidence: LeadQualificationConfidence,
): LeadQualificationRecommendation {
  if (confidence === 'LOW') return 'REVIEW';
  if (score >= 60) return 'QUALIFY';
  if (score < 35) return 'DISQUALIFY';
  return 'NURTURE';
}

export interface LeadQualificationReason {
  key: LeadQualificationDimensionKey;
  label: string;
  value: number | null;
}

export interface LeadQualificationAssessment {
  /** 0–100 across the rated dimensions. */
  score: number;
  confidence: LeadQualificationConfidence;
  /** How many of the eight dimensions are rated. */
  coverage: { rated: number; total: number };
  recommendation: LeadQualificationRecommendation;
  /** Dimensions scoring well — why this lead is worth effort. */
  strengths: LeadQualificationReason[];
  /** Weak or unrated dimensions — what to go and find out. Never a black box. */
  gaps: LeadQualificationReason[];
}

const STRENGTH_AT = 70;
const GAP_AT = 40;

/**
 * The whole verdict in one call: score, how much we actually know, the recommendation, and — the
 * part that makes it usable — WHY, as named strengths and gaps. A number with no reasons cannot be
 * argued with or acted on, and would just be ignored.
 */
export function assessLeadQualification(dimensions: LeadQualificationDimensions = {}): LeadQualificationAssessment {
  const score = scoreLeadQualification(dimensions);
  const confidence = leadQualificationConfidence(dimensions);
  const strengths: LeadQualificationReason[] = [];
  const gaps: LeadQualificationReason[] = [];

  for (const key of LEAD_QUALIFICATION_DIMENSIONS) {
    const raw = dimensions[key];
    const value = typeof raw === 'number' && Number.isFinite(raw) ? clamp(raw) : null;
    const reason = { key, label: LEAD_QUALIFICATION_LABELS[key], value };
    // Unrated is a gap: "we have not asked" is a real thing to go and do, not a neutral absence.
    if (value === null || value <= GAP_AT) gaps.push(reason);
    else if (value >= STRENGTH_AT) strengths.push(reason);
  }

  return {
    score,
    confidence,
    coverage: { rated: rated(dimensions).length, total: LEAD_QUALIFICATION_DIMENSIONS.length },
    recommendation: recommendLeadQualification(score, confidence),
    strengths,
    gaps,
  };
}

/** Keep only known dimension keys, clamped — the API edge must not persist junk into the jsonb. */
export function normalizeLeadQualification(input: unknown): LeadQualificationDimensions {
  if (!input || typeof input !== 'object') return {};
  const src = input as Record<string, unknown>;
  const out: LeadQualificationDimensions = {};
  for (const key of LEAD_QUALIFICATION_DIMENSIONS) {
    const v = src[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = clamp(Math.round(v));
  }
  return out;
}

export const LEAD_QUALIFICATION_EVENT = {
  assessed: 'crm.lead.qualification_assessed',
} as const;
