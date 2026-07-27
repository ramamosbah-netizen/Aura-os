// Bid/No-Bid qualification — the Go/No-Go scoring, pure and framework-free.
//
// A tender is qualified BEFORE it is estimated: weighted criteria (client, capacity, margin, risk,
// competition …) each scored 0–10 roll up to one 0–100 number and a recommendation, so the
// bid/no-bid call is consistent and defensible rather than a gut feel. It lives in `shared` for the
// same reason the estimation engine does: the Tendering module computes the authoritative score on
// save AND the qualification UI previews it live as the estimator moves the sliders — one function,
// never two that drift.

export type BidRecommendation = 'go' | 'conditional' | 'no_go';

export interface BidCriterion {
  name: string;
  /** Relative importance (>0). Weights are normalised across criteria. */
  weight: number;
  /** Raw score for this criterion, 0–10. */
  score: number;
}

const r2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** Weighted 0–100 score from criteria (each score 0–10, weights normalised). */
export function computeBidScore(criteria: BidCriterion[]): number {
  const totalWeight = criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  if (totalWeight <= 0) return 0;
  const weighted = criteria.reduce((s, c) => s + (Number(c.weight) || 0) * (Number(c.score) || 0), 0);
  return r2((weighted / totalWeight) * 10); // score 0–10 → 0–100
}

/** GO at ≥70, CONDITIONAL at ≥50, otherwise NO-GO. */
export function recommendationFor(total: number): BidRecommendation {
  if (total >= 70) return 'go';
  if (total >= 50) return 'conditional';
  return 'no_go';
}

/**
 * A default Bid/No-Bid checklist for an ELV/MEP contractor. The weights say what actually sinks a
 * bid (payment risk, capacity) vs what merely helps (strategic fit). Callers seed each criterion at
 * a neutral score of 5 — an untouched assessment reads CONDITIONAL (50), never a false GO.
 */
export const DEFAULT_BID_CRITERIA: readonly Omit<BidCriterion, 'score'>[] = [
  { name: 'Strategic fit', weight: 2 },
  { name: 'Client relationship & payment history', weight: 3 },
  { name: 'Technical capability & capacity', weight: 3 },
  { name: 'Win probability vs competition', weight: 2 },
  { name: 'Margin potential', weight: 3 },
  { name: 'Contract & delivery risk', weight: 3 },
];
