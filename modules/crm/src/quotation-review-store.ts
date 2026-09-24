import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { QuotationReviewDecision } from './domain/quotation-review';

export const CRM_QUOTATION_REVIEW_STORE = Symbol('CRM_QUOTATION_REVIEW_STORE');

/**
 * Append-only store for commercial review decisions — written when a reviewer returns an offer for
 * revision, read by whoever has to act on it. No update path: a send-back is a fact about a moment
 * and a revision, and re-editing it would rewrite what the reviewer actually said.
 */
export interface QuotationReviewStore {
  /** Save on the caller's transaction so the status change and its reason land together. */
  saveWithClient(tx: TxHandle | null, decision: QuotationReviewDecision): Promise<void>;
  /** Every decision on one offer, oldest first — an offer returned twice shows both. */
  listByQuotation(tenantId: Id, quotationId: Id): Promise<QuotationReviewDecision[]>;
}
