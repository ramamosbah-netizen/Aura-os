import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { Id } from '@aura/shared';
import {
  makeQuotationLine, lineAmountInQuotedCurrency, requirementCoverage,
  type ComplianceResponse, type QuotationLine, type QuoteResponse, type RequirementCoverage,
} from './domain/quotation-line';
import { QUOTATION_LINE_STORE, type QuotationLineStore } from './quotation-line.store';
import { RFQ_STORE, type RfqStore } from './rfq-store';
import { QUOTATION_LINE_EVALUATION_STORE, type QuotationLineEvaluationStore } from './quotation-line-evaluation.store';
import { QUOTATION_FAMILY_STORE, type QuotationFamilyStore } from './quotation-family.store';
import { technicalEligibility, type TechnicalEligibility, type TechnicalVerdict } from './domain/quotation-line-evaluation';
import type { LineDiscountBasis } from './domain/purchase-order-line';
import { PR_LINE_STORE, type PurchaseRequestLineStore } from './purchase-request-line-store';

export interface NewQuotationLineInput {
  revisionId: Id;
  supplierDescription?: string | null;
  partNumber?: string | null;
  commercialDeviation?: string | null;
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
  /** WHICH KIND of discount — the domain defaults to the one AURA records and refuses others. */
  lineDiscountBasis?: LineDiscountBasis | null;
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
    /**
     * The technical verdicts, so the OUTBOUND handoff reaches the Buyer where they already work.
     *
     * OPTIONAL and LAST — positional construction. Unbound, eligibility reads `unknown`, which is the
     * honest answer when the verdicts cannot be read: never eligible by default.
     */
    @Optional() @Inject(QUOTATION_LINE_EVALUATION_STORE) private readonly evaluations: QuotationLineEvaluationStore | null = null,
    /**
     * The quotation families, so a revision-bound line can be checked against the offer it belongs
     * to. OPTIONAL and LAST — a union-typed constructor parameter emits `Object` in
     * design:paramtypes, so the explicit @Inject is what makes Nest bind it at all, and appending
     * rather than inserting is what keeps every existing positional construction working.
     *
     * Unbound, a revision-bound line is REFUSED rather than written against an unverified offer:
     * optional dependency, never optional evidence.
     */
    @Optional() @Inject(QUOTATION_FAMILY_STORE) private readonly families: QuotationFamilyStore | null = null,
  ) {}

  /**
   * Record what a supplier offered for ONE requirement.
   *
   * A line may be bound to a quotation REVISION (QC-01) or, for rows that predate the family model,
   * to a legacy quotation. The revision path is checked here so a line cannot be written against a
   * revision that is closed: once a revision is received it is a commercial snapshot, and adding a
   * price to it afterwards would change what the supplier is recorded as having sent.
   */
  async add(tenantId: Id, input: NewQuotationLineInput): Promise<QuotationLine> {
    /**
     * A line belongs to a REVISION. The legacy quotation branch is gone with `quotation_id`
     * (migration 0352): every line is now bound to the immutable revision that quoted it, so the
     * prices in Rev 1 stay exactly as quoted when Rev 2 arrives.
     */
    if (!input.revisionId) {
      throw new Error('a quotation line must belong to a quotation revision');
    }
    {
      if (!this.families) {
        throw new Error(
          'cannot verify which quotation revision this line belongs to — the quotation is unavailable, ' +
          'and a price recorded against an unchecked offer cannot be attributed to a supplier',
        );
      }
      const revision = await this.families.getRevision(tenantId, input.revisionId);
      if (!revision) throw new Error(`quotation revision ${input.revisionId} not found`);
      if (revision.status !== 'draft' && revision.status !== 'received') {
        throw new Error(
          `revision ${revision.revisionNo} is ${revision.status} and cannot take new lines — ` +
          'record the supplier\u2019s change as a new revision',
        );
      }
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

    // One answer per requirement per OFFER. Two prices for one requirement inside one offer is an
    // ambiguity nobody can resolve; the same item priced on a base offer AND on an alternative is
    // two legitimate answers, which is why this is scoped to the revision rather than the supplier.
    const siblings = await this.lines.listByRevision(tenantId, input.revisionId);
    if (siblings.some((l) => l.prLineId === input.prLineId)) {
      throw new Error('this quotation revision already answers that requisition line');
    }

    const line = makeQuotationLine({ ...input, tenantId, companyId: null });
    await this.lines.create(line);
    this.logger.log(`Revision ${input.revisionId} answered requisition line ${input.prLineId} (${line.response})`);
    return line;
  }



  /**
   * THE OFFERS, EACH CARRYING THE TECHNICAL DECISION THAT WAS MADE ABOUT IT.
   *
   * This is `SUP-01`'s OUTBOUND handoff: the Technical Manager decides, and the verdict reaches the
   * Buyer in the Buyer's own context and under the Buyer's own permission. A decision the next role
   * has to go and look up in another surface has not been handed over.
   *
   * The RATIONALE and the decision history are deliberately NOT included. A buyer needs to know
   * whether an offer may be considered and who said so; the reasoning and the amendment trail belong
   * to the technical surface where the judgement was made.
   */
  async listByRevisionForBuyer(tenantId: Id, revisionId: Id): Promise<Array<QuotationLine & {
    eligibility: TechnicalEligibility; verdict: TechnicalVerdict | null; decidedBy: Id | null;
  }>> {
    const lines = await this.lines.listByRevision(tenantId, revisionId);
    const decorated = [];
    for (const line of lines) {
      const current = this.evaluations ? await this.evaluations.findCurrent(tenantId, line.id) : null;
      decorated.push({
        ...line,
        eligibility: technicalEligibility(current),
        verdict: current?.verdict ?? null,
        decidedBy: current?.decidedBy ?? null,
      });
    }
    return decorated;
  }

  /** Every supplier's answer to one requirement — what a comparison is built from. */
  /** Every line of one revision — what that supplier offered at the prices in that revision. */
  listByRevision(tenantId: Id, revisionId: Id): Promise<QuotationLine[]> {
    return this.lines.listByRevision(tenantId, revisionId);
  }

  listByRequirement(tenantId: Id, prLineId: Id): Promise<QuotationLine[]> {
    return this.lines.listByRequirement(tenantId, prLineId);
  }

  /** One supplier's answer, by id — never another tenant's. */
  async get(tenantId: Id, id: Id): Promise<QuotationLine | null> {
    const line = await this.lines.get(id);
    return line && line.tenantId === tenantId ? line : null;
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
  async summarise(tenantId: Id, revisionId: Id, prLineIds: Id[]): Promise<{
    coverage: RequirementCoverage;
    currency: string | null;
    quotedAmount: number | null;
  }> {
    const revision = await this.families?.getRevision(tenantId, revisionId);
    const lines = await this.lines.listByRevision(tenantId, revisionId);
    const amounts = lines.map(lineAmountInQuotedCurrency).filter((a): a is number => a !== null);
    return {
      coverage: requirementCoverage(prLineIds, lines),
      // NULL currency is UNKNOWN, never the base currency — see migration 0343.
      currency: revision?.currency ?? null,
      quotedAmount: amounts.length > 0 ? amounts.reduce((sum, a) => sum + a, 0) : null,
    };
  }
}
