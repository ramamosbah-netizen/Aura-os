import type { Id } from '@aura/shared';
import type { QuotationLineEvaluation } from './domain/quotation-line-evaluation';
import type { QuotationLineEvaluationStore } from './quotation-line-evaluation.store';

export class InMemoryQuotationLineEvaluationStore implements QuotationLineEvaluationStore {
  private readonly rows = new Map<string, QuotationLineEvaluation>();

  async create(e: QuotationLineEvaluation): Promise<void> {
    this.rows.set(e.id, { ...e });
  }

  async findCurrent(tenantId: Id, quotationLineId: Id): Promise<QuotationLineEvaluation | null> {
    return [...this.rows.values()].find(
      (e) => e.tenantId === tenantId && e.quotationLineId === quotationLineId && e.supersededAt === null,
    ) ?? null;
  }

  async listForLine(tenantId: Id, quotationLineId: Id): Promise<QuotationLineEvaluation[]> {
    return [...this.rows.values()]
      .filter((e) => e.tenantId === tenantId && e.quotationLineId === quotationLineId)
      .sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1));
  }

  async markSuperseded(id: Id, supersededAt: string, supersededBy: Id): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, supersededAt, supersededBy });
  }
}
