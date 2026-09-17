import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Id } from '@aura/shared';
import {
  makeQuotationLine, lineAmountInQuotedCurrency, requirementCoverage,
  type ComplianceResponse, type QuotationLine, type QuoteResponse, type RequirementCoverage,
} from './domain/quotation-line';
import { QUOTATION_LINE_STORE, type QuotationLineStore } from './quotation-line.store';
import { RFQ_STORE, type RfqStore } from './rfq-store';
import { PR_LINE_STORE, type PurchaseRequestLineStore } from './purchase-request-line-store';

export interface NewQuotationLineInput {
  quotationId: Id;
  prLineId: Id;
  response?: QuoteResponse;
  offeredManufacturer?: string | null;
  offeredModel?: string | null;
  isAlternate?: boolean;
  complianceResponse?: ComplianceResponse | null;
  deviations?: string | null;
  exclusions?: string | null;
  quantity?: number | null;
  uom?: string | null;
  unitPrice?: number | null;
  lineDiscount?: number | null;
  leadTimeDays?: number | null;
  warrantyMonths?: number | null;
  notes?: string | null;
  createdBy?: Id | null;
}

/**
 * What a supplier offered, item by item (Wave 4 supplier-decision spine).
 *
 * The service's whole job beyond persistence is LINEAGE: a quotation line must answer a requisition
 * line that actually exists, on a quotation that actually exists. An offer against a requirement
 * nobody asked for cannot be compared with anything, and an unchecked `prLineId` would let a
 * comparison silently include or miss offers depending on a typo.
 *
 * It deliberately decides NOTHING about the offer. No compliance, no eligibility, no rank, no
 * comparable value — those belong to the technical evaluation authority and to commercial
 * normalisation, each a later slice with its own authority behind it.
 */
@Injectable()
export class QuotationLineService {
  private readonly logger = new Logger('QuotationLines');

  constructor(
    @Inject(QUOTATION_LINE_STORE) private readonly lines: QuotationLineStore,
    @Inject(RFQ_STORE) private readonly rfqs: RfqStore,
    /**
     * The requisition lines a quotation may answer. OPTIONAL and LAST — this service is built
     * positionally in some suites, and explicit @Inject because a union-typed parameter emits
     * `Object` in design:paramtypes and Nest would silently bind nothing.
     *
     * Unbound, an offer's lineage cannot be checked and the line is REFUSED rather than written
     * against an unverified requirement: optional dependency, never optional evidence.
     */
    @Optional() @Inject(PR_LINE_STORE) private readonly prLines: PurchaseRequestLineStore | null = null,
  ) {}

  async add(tenantId: Id, input: NewQuotationLineInput): Promise<QuotationLine> {
    const quote = await this.rfqs.getQuote(input.quotationId);
    if (!quote || quote.tenantId !== tenantId) {
      throw new Error(`quotation ${input.quotationId} not found`);
    }

    if (!this.prLines) {
      throw new Error(
        'cannot verify which requisition line this offer answers — the requisition is unavailable, ' +
        'and an offer recorded against an unchecked requirement cannot be compared with anything',
      );
    }
    const requirement = await this.prLines.find(input.prLineId, tenantId);
    if (!requirement) {
      throw new Error(`requisition line ${input.prLineId} not found`);
    }

    const existing = await this.lines.findForRequirement(tenantId, input.quotationId, input.prLineId);
    if (existing) {
      throw new Error('this quotation already answers that requisition line');
    }

    const line = makeQuotationLine({ ...input, tenantId, companyId: quote.companyId ?? null });
    await this.lines.create(line);
    this.logger.log(`Quotation ${input.quotationId} answered requisition line ${input.prLineId} (${line.response})`);
    return line;
  }

  listByQuotation(tenantId: Id, quotationId: Id): Promise<QuotationLine[]> {
    return this.lines.listByQuotation(tenantId, quotationId);
  }

  /** Every supplier's answer to one requirement — what a comparison is built from. */
  listByRequirement(tenantId: Id, prLineId: Id): Promise<QuotationLine[]> {
    return this.lines.listByRequirement(tenantId, prLineId);
  }

  async remove(tenantId: Id, id: Id): Promise<void> {
    const line = await this.lines.get(id);
    if (!line || line.tenantId !== tenantId) throw new Error(`quotation line ${id} not found`);
    await this.lines.remove(id);
  }

  /**
   * How much of what was asked for this quotation answers, and the supplier's own totals.
   *
   * `amounts` are in the QUOTATION'S OWN CURRENCY and are derived from quantity × unit price, never
   * stored. They are not comparable across suppliers — no conversion, no tax, no freight — and the
   * currency is returned beside them so a caller cannot forget that.
   */
  async summarise(tenantId: Id, quotationId: Id, prLineIds: Id[]): Promise<{
    coverage: RequirementCoverage;
    currency: string | null;
    quotedAmount: number | null;
  }> {
    const quote = await this.rfqs.getQuote(quotationId);
    const lines = await this.lines.listByQuotation(tenantId, quotationId);
    const amounts = lines.map(lineAmountInQuotedCurrency).filter((a): a is number => a !== null);
    return {
      coverage: requirementCoverage(prLineIds, lines),
      // NULL currency is UNKNOWN, never the base currency — see migration 0343.
      currency: quote?.currency ?? null,
      quotedAmount: amounts.length > 0 ? amounts.reduce((sum, a) => sum + a, 0) : null,
    };
  }
}
