import { type Id, newId } from '@aura/shared';

// Tendering domain — framework-free. A BidScore is a go/no-go qualification of a tender:
// weighted scoring across criteria (client, margin, competition, capacity, risk …) producing
// an overall 0–100 score and a recommendation, so bid/no-bid decisions are consistent.

export type BidRecommendation = 'go' | 'conditional' | 'no_go';

export interface BidCriterion {
  name: string;
  /** Relative importance (>0). Weights are normalised across criteria. */
  weight: number;
  /** Raw score for this criterion, 0–10. */
  score: number;
}

export interface BidScore {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  tenderId: Id;
  tenderTitle: string | null;
  criteria: BidCriterion[];
  /** Weighted overall score, 0–100. */
  totalScore: number;
  recommendation: BidRecommendation;
  notes: string | null;
  decidedBy: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewBidScore {
  tenantId: Id;
  companyId?: Id | null;
  tenderId: Id;
  tenderTitle?: string | null;
  criteria: BidCriterion[];
  notes?: string | null;
  decidedBy?: Id | null;
  createdBy?: Id | null;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Weighted 0–100 score from criteria (each score 0–10, weights normalised). */
export function computeBidScore(criteria: BidCriterion[]): number {
  const totalWeight = criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  if (totalWeight <= 0) return 0;
  const weighted = criteria.reduce((s, c) => s + (Number(c.weight) || 0) * (Number(c.score) || 0), 0);
  return r2((weighted / totalWeight) * 10); // score 0–10 → 0–100
}

export function recommendationFor(total: number): BidRecommendation {
  if (total >= 70) return 'go';
  if (total >= 50) return 'conditional';
  return 'no_go';
}

export function makeBidScore(input: NewBidScore): BidScore {
  const criteria = (input.criteria ?? []).map((c) => ({
    name: c.name.trim(),
    weight: Number(c.weight) || 0,
    score: Number(c.score) || 0,
  }));
  const totalScore = computeBidScore(criteria);
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    tenderId: input.tenderId,
    tenderTitle: input.tenderTitle?.trim() || null,
    criteria,
    totalScore,
    recommendation: recommendationFor(totalScore),
    notes: input.notes?.trim() || null,
    decidedBy: input.decidedBy ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export const BID_SCORE_EVENT = {
  scored: 'tendering.bid_score.created',
} as const;
