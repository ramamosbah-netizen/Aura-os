import type { Id } from '@aura/shared';
import type { QuotationLine } from './domain/quotation-line';

/** DI token for the quotation-line store. */
export const QUOTATION_LINE_STORE = Symbol('QUOTATION_LINE_STORE');

export interface QuotationLineStore {
  create(line: QuotationLine): Promise<void>;
  update(line: QuotationLine): Promise<void>;
  get(id: Id): Promise<QuotationLine | null>;
  remove(id: Id): Promise<void>;
  /** Everything one supplier offered on one quotation. */
  listByQuotation(tenantId: Id, quotationId: Id): Promise<QuotationLine[]>;
  /**
   * Every supplier's answer to ONE requirement, across quotations.
   *
   * This is the read the comparison is built on, and it is why the grain is the requisition line:
   * the question a buyer actually asks is "what did everyone offer for this item", not "what did
   * this supplier say". Assembling it by fetching each quotation and filtering would make the answer
   * depend on which quotations the caller happened to know about.
   */
  listByRequirement(tenantId: Id, prLineId: Id): Promise<QuotationLine[]>;
  /** One supplier's answer to one requirement — the uniqueness the table enforces. */
  findForRequirement(tenantId: Id, quotationId: Id, prLineId: Id): Promise<QuotationLine | null>;
}
