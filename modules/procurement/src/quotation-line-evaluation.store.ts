import type { Id } from '@aura/shared';
import type { QuotationLineEvaluation } from './domain/quotation-line-evaluation';

export const QUOTATION_LINE_EVALUATION_STORE = Symbol('QUOTATION_LINE_EVALUATION_STORE');

export interface QuotationLineEvaluationStore {
  create(evaluation: QuotationLineEvaluation): Promise<void>;
  /** The verdict in force — the un-superseded one. NULL means nobody has decided. */
  findCurrent(tenantId: Id, quotationLineId: Id): Promise<QuotationLineEvaluation | null>;
  /** The whole chain, newest first — the audit trail a superseded decision exists for. */
  listForLine(tenantId: Id, quotationLineId: Id): Promise<QuotationLineEvaluation[]>;
  markSuperseded(id: Id, supersededAt: string, supersededBy: Id): Promise<void>;
}
