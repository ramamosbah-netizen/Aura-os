import { randomUUID } from 'node:crypto';

/**
 * WHY AN OFFER WAS SENT BACK, kept as a list rather than a column.
 *
 * A commercial review could only approve. An offer whose figures the reviewer wanted corrected had
 * to be cancelled outright — so "the estimator got it wrong and fixed it" and "the deal died" were
 * the same record, and the costing freeze introduced with it would have stranded corrections
 * instead of governing them.
 *
 * APPEND-ONLY, because a second send-back does not erase the first. An offer returned twice for
 * the same reason is a different fact from one returned once, and it is the fact a commercial
 * manager most wants to see before approving the third submission.
 */

/**
 * `returned` — the commercial reviewer sent the offer back (the reviewer's reason).
 * `revised` — the offer was superseded by its next revision (EST-16, the owner's decision of 2026-09-25):
 * the reason is the reviser's, recorded against the revision it supersedes, beside the returns.
 */
export type QuotationReviewOutcome = 'returned' | 'revised';

export interface QuotationReviewDecision {
  id: string;
  tenantId: string;
  companyId: string | null;
  quotationId: string;
  quoteNumber: string;
  /** The revision the decision was made against — which set of figures it was about. */
  revision: number;
  outcome: QuotationReviewOutcome;
  decidedBy: string | null;
  decidedAt: string;
  reason: string;
}

export interface NewQuotationReviewDecision {
  tenantId: string;
  companyId?: string | null;
  quotationId: string;
  quoteNumber: string;
  revision?: number;
  outcome?: QuotationReviewOutcome;
  decidedBy?: string | null;
  reason: string;
}

export function makeQuotationReviewDecision(input: NewQuotationReviewDecision): QuotationReviewDecision {
  const reason = input.reason?.trim();
  // A send-back with no reason tells the estimator nothing. It is not a review decision; it is an
  // obstruction, and it would make the record of it useless to the person who has to act on it.
  if (!reason) {
    throw new Error(input.outcome === 'revised'
      ? 'validation: revising an offer requires a reason — the next revision must say why the last one changed'
      : 'validation: returning an offer for revision requires a reason — the estimator has to know what to change');
  }
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    quotationId: input.quotationId,
    quoteNumber: input.quoteNumber,
    revision: Math.max(0, Math.floor(Number(input.revision) || 0)),
    outcome: input.outcome ?? 'returned',
    decidedBy: input.decidedBy?.trim() || null,
    decidedAt: new Date().toISOString(),
    reason,
  };
}
