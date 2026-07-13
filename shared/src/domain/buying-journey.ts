// Customer Buying Journey + Pursue/Bid decision (S6). Two ideas:
//   1. Track BOTH our sales stage and the customer's buying stage, and flag when we are running
//      ahead of the customer (a classic way deals slip — we send a proposal before the buyer has
//      even agreed there's a problem).
//   2. A structured Pursue / No-Pursue assessment so the company stops chasing every opportunity.
// Framework-free; deterministic so API, UI and tests share one rule set.

export type BuyingStage =
  | 'PROBLEM_RECOGNIZED' | 'REQUIREMENTS_DEFINING' | 'OPTIONS_EVALUATING'
  | 'INTERNAL_APPROVAL' | 'PROCUREMENT' | 'DECISION' | 'DEFERRED';

/** The buying ladder, in order. DEFERRED sits off the ladder (a stall, not progress). */
export const BUYING_LADDER: readonly BuyingStage[] = [
  'PROBLEM_RECOGNIZED', 'REQUIREMENTS_DEFINING', 'OPTIONS_EVALUATING',
  'INTERNAL_APPROVAL', 'PROCUREMENT', 'DECISION',
];

/** The buying stage each active sales stage EXPECTS the customer to have reached. */
const EXPECTED_BUYING: Record<string, BuyingStage> = {
  qualification: 'PROBLEM_RECOGNIZED',
  proposal: 'OPTIONS_EVALUATING',
  negotiation: 'INTERNAL_APPROVAL',
};

export type AlignmentSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface BuyingAlignment {
  /** False when the buying stage is unknown or the sales stage is terminal — nothing to assess. */
  assessed: boolean;
  aligned: boolean;
  /** How many ladder steps we are ahead of the customer (0 when aligned). */
  gap: number;
  severity: AlignmentSeverity | null;
  reason: string | null;
}

const ordinal = (s: BuyingStage): number => BUYING_LADDER.indexOf(s); // -1 for DEFERRED

/**
 * Compare our sales stage against the customer's buying stage. Being AHEAD of the customer
 * (we're at proposal, they've barely recognized the problem) is the risk this detects.
 */
export function buyingJourneyAlignment(salesStage: string, buyingStage: BuyingStage | null): BuyingAlignment {
  const expected = EXPECTED_BUYING[salesStage];
  if (!expected || buyingStage === null) {
    return { assessed: false, aligned: true, gap: 0, severity: null, reason: null };
  }
  if (buyingStage === 'DEFERRED') {
    return { assessed: true, aligned: false, gap: 0, severity: 'HIGH', reason: 'customer has deferred the decision' };
  }
  const gap = ordinal(expected) - ordinal(buyingStage);
  if (gap <= 0) return { assessed: true, aligned: true, gap: 0, severity: null, reason: null };
  if (gap === 1) {
    return { assessed: true, aligned: false, gap, severity: 'MEDIUM', reason: 'customer is one step behind our sales stage' };
  }
  return { assessed: true, aligned: false, gap, severity: 'HIGH', reason: 'we are well ahead of the customer’s buying process' };
}

// ─────────────────────────── Pursue / No-Pursue ───────────────────────────

export type PursuitDecision = 'PURSUE' | 'NO_PURSUE';

/** Assessment dimensions — all 0–100, higher is better (riskComfort = how comfortable the risk is,
 * so a high value means low risk). */
export const PURSUIT_DIMENSIONS = [
  'strategicFit', 'winability', 'relationshipAccess', 'technicalCapability', 'resourceCapacity',
  'commercialAttractiveness', 'expectedMargin', 'competitivePosition', 'riskComfort',
] as const;
export type PursuitDimensionKey = (typeof PURSUIT_DIMENSIONS)[number];
export type PursuitDimensions = Partial<Record<PursuitDimensionKey, number>>;

const clamp = (n: number): number => Math.max(0, Math.min(100, n));

/** Average of the provided dimensions (0–100). Missing dimensions are ignored, not zero. */
export function scorePursuit(dimensions: PursuitDimensions): number {
  const vals = PURSUIT_DIMENSIONS.map((k) => dimensions[k]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((s, v) => s + clamp(v), 0) / vals.length);
}

export type PursuitRecommendation = 'PURSUE' | 'REVIEW' | 'NO_PURSUE';

/** Turn a score into a recommendation. The company should not chase everything. */
export function recommendPursuit(score: number): PursuitRecommendation {
  if (score >= 60) return 'PURSUE';
  if (score < 40) return 'NO_PURSUE';
  return 'REVIEW';
}

export const CRM_JOURNEY_EVENT = {
  buyingStageChanged: 'crm.opportunity.buying_stage_changed',
  pursuitDecided: 'crm.opportunity.pursuit_decided',
} as const;
