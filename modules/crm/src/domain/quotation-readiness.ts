import type { ExecutionType, OpportunityStage } from '@aura/shared';

/**
 * Quotation readiness gate — the domain rule for "can a direct quotation be raised from this deal?".
 *
 * Ownership rules (always): a tender-route deal is quoted through its tender, and a lost deal cannot
 * be quoted. Won is deliberately NOT required — a proposal precedes the win.
 *
 * Evidence chain (Phase 2): once a deal is GOVERNED — i.e. a Pre-Award package with revisions backs
 * it — a quotation additionally requires an approved Scope revision + approved Estimate revision +
 * frozen Pricing revision (the Q→P→E→B chain). This is applied ONLY when `facts.governed` is true, so
 * deals created before the Pre-Award flow existed are grandfathered onto the ownership-only rules and
 * nothing breaks; enforcement turns on for a deal exactly when it gains a governed package.
 */
export interface QuotationReadinessCandidate {
  stage: OpportunityStage;
  executionType: ExecutionType;
  /** Set once a tender owns this deal's commercial progression (see Opportunity.tenderId). */
  tenderId: string | null;
}

export interface QuotationReadinessFacts {
  /** True once a Pre-Award package with revisions backs this deal. False ⇒ grandfathered (legacy). */
  governed?: boolean;
  scopeApproved?: boolean;
  estimateApproved?: boolean;
  pricingFrozen?: boolean;
}

export type QuotationReadinessGapCode =
  | 'TENDER_OWNED'
  | 'DEAL_LOST'
  | 'SCOPE_NOT_APPROVED'
  | 'ESTIMATE_NOT_APPROVED'
  | 'PRICING_NOT_FROZEN';

export interface QuotationReadinessGap {
  code: QuotationReadinessGapCode;
  message: string;
}

export interface QuotationReadiness {
  ready: boolean;
  gaps: QuotationReadinessGap[];
}

const gap = (code: QuotationReadinessGapCode, message: string): QuotationReadinessGap => ({ code, message });

export function quotationReadiness(
  opp: QuotationReadinessCandidate,
  facts: QuotationReadinessFacts = {},
): QuotationReadiness {
  const gaps: QuotationReadinessGap[] = [];

  // Ownership (always enforced).
  if (opp.tenderId || opp.executionType === 'tender') {
    gaps.push(gap('TENDER_OWNED', 'this is a tender-route deal — quote it through its tender, not a direct quotation'));
  }
  if (opp.stage === 'lost') {
    gaps.push(gap('DEAL_LOST', 'a lost deal cannot be quoted'));
  }

  // Evidence chain — only once the deal is governed by a Pre-Award package (grandfather otherwise).
  if (facts.governed) {
    if (!facts.scopeApproved) gaps.push(gap('SCOPE_NOT_APPROVED', 'approve the scope revision before quoting'));
    if (!facts.estimateApproved) gaps.push(gap('ESTIMATE_NOT_APPROVED', 'complete and approve the estimate revision before quoting'));
    if (!facts.pricingFrozen) gaps.push(gap('PRICING_NOT_FROZEN', 'freeze the pricing revision before quoting'));
  }

  return { ready: gaps.length === 0, gaps };
}

/** 409-style message ("only … can …" marks a state-conflict in the API error taxonomy). */
export function quotationReadinessMessage(gaps: QuotationReadinessGap[]): string {
  return `only a deal that meets the quotation gate can be quoted — ${gaps.map((g) => g.message).join('; ')}`;
}
