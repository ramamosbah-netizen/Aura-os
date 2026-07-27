import { type Id, newId, computeBidScore, recommendationFor, type BidRecommendation, type BidCriterion } from '@aura/shared';

// Tendering domain — framework-free. A BidScore is the persisted record of a go/no-go qualification:
// the weighted criteria + the overall score/recommendation. The SCORING itself (computeBidScore /
// recommendationFor / BidCriterion / BidRecommendation) lives in `@aura/shared` so the tender module
// and the qualification UI compute it the same way; re-exported here so existing importers of this
// module are unaffected.
export { computeBidScore, recommendationFor } from '@aura/shared';
export type { BidRecommendation, BidCriterion } from '@aura/shared';

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
