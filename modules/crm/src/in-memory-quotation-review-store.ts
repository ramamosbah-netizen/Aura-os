import type { Id } from '@aura/shared';
import type { TxHandle } from '@aura/core';
import type { QuotationReviewDecision } from './domain/quotation-review';
import type { QuotationReviewStore } from './quotation-review-store';

/** Phase-0 review-decision store — append-only in memory (no-DB boots). */
export class InMemoryQuotationReviewStore implements QuotationReviewStore {
  private readonly rows: QuotationReviewDecision[] = [];

  async saveWithClient(_tx: TxHandle | null, decision: QuotationReviewDecision): Promise<void> {
    this.rows.push({ ...decision });
  }

  async listByQuotation(tenantId: Id, quotationId: Id): Promise<QuotationReviewDecision[]> {
    return this.rows
      .filter((r) => r.tenantId === tenantId && r.quotationId === quotationId)
      .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
      .map((r) => ({ ...r }));
  }
}
