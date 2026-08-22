import type { ExecutionType, OpportunityStage } from '@aura/shared';

/**
 * Quotation readiness gate — the domain rule for "can a direct quotation be raised from this deal?".
 *
 * Phase 0 proves ONLY what the domain supports today: a quotation is NOT gated on the deal being Won
 * (a proposal precedes the win), a tender-route deal is quoted through its tender (not directly), and
 * a lost deal cannot be quoted. It deliberately carries no speculative future codes — Phase 2 will
 * add the evidence chain (approved Scope + approved Estimate + frozen Pricing) when those checks
 * actually exist, so the gate never claims a guarantee the domain cannot yet keep.
 */
export interface QuotationReadinessCandidate {
  stage: OpportunityStage;
  executionType: ExecutionType;
  /** Set once a tender owns this deal's commercial progression (see Opportunity.tenderId). */
  tenderId: string | null;
}

export type QuotationReadinessGapCode = 'TENDER_OWNED' | 'DEAL_LOST';

export interface QuotationReadinessGap {
  code: QuotationReadinessGapCode;
  message: string;
}

export interface QuotationReadiness {
  ready: boolean;
  gaps: QuotationReadinessGap[];
}

const gap = (code: QuotationReadinessGapCode, message: string): QuotationReadinessGap => ({ code, message });

export function quotationReadiness(opp: QuotationReadinessCandidate): QuotationReadiness {
  const gaps: QuotationReadinessGap[] = [];
  // Ownership: a tender-route deal is quoted through its tender's pricing, never a direct quotation.
  if (opp.tenderId || opp.executionType === 'tender') {
    gaps.push(gap('TENDER_OWNED', 'this is a tender-route deal — quote it through its tender, not a direct quotation'));
  }
  // A lost deal cannot be quoted. (Won is deliberately NOT required — a proposal precedes the win.)
  if (opp.stage === 'lost') {
    gaps.push(gap('DEAL_LOST', 'a lost deal cannot be quoted'));
  }
  return { ready: gaps.length === 0, gaps };
}

/** 409-style message ("only … can …" marks a state-conflict in the API error taxonomy). */
export function quotationReadinessMessage(gaps: QuotationReadinessGap[]): string {
  return `only a deal that meets the quotation gate can be quoted — ${gaps.map((g) => g.message).join('; ')}`;
}
