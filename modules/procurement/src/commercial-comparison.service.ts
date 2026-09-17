import { Inject, Injectable, Logger } from '@nestjs/common';
import { ExchangeRateService } from '@aura/core';
import type { Id } from '@aura/shared';
import { PR_LINE_STORE, type PurchaseRequestLineStore } from './purchase-request-line-store';
import { QUOTATION_LINE_STORE, type QuotationLineStore } from './quotation-line.store';
import { QUOTATION_FAMILY_STORE, type QuotationFamilyStore } from './quotation-family.store';
import { RFQ_STORE, type RfqStore } from './rfq-store';
import { effectiveRevision, noEffectiveRevisionReason, type QuotationRevision } from './domain/quotation-family';
import {
  commercialStatus,
  normaliseRequirementLine,
  quotationCommercialComponents,
  type ComparisonContext,
  type NormalisedRequirementLine,
  type QuotationCommercialComponents,
  type ResolvedFx,
  type RevisionProvenance,
} from './domain/commercial-normalisation';

/**
 * SUP-06 — every supplier's answer to ONE requisition line, expressed comparably.
 *
 * IT COMPARES THE COMMERCIALLY EFFECTIVE REVISION, and only that (QC-01). Not the latest revision
 * number, and never all of a supplier's revisions as competing offers — that would let one supplier
 * occupy several positions in a comparison and mix a historical price with a current one.
 *
 * A supplier with NO effective revision — withdrawn, rejected, or captured and never confirmed —
 * still APPEARS, carrying the reason instead of values. Filtering them out would remove a supplier
 * from the buyer's view with nothing to prompt the question, which is the failure nobody notices.
 *
 * It ranks nothing. No cheapest, no winner, no ordering by price: a decision is SUP-13's authority,
 * and an ordering is a recommendation under another name.
 */
@Injectable()
export class CommercialComparisonService {
  private readonly logger = new Logger('CommercialComparison');

  constructor(
    @Inject(PR_LINE_STORE) private readonly prLines: PurchaseRequestLineStore,
    @Inject(QUOTATION_LINE_STORE) private readonly quotationLines: QuotationLineStore,
    @Inject(QUOTATION_FAMILY_STORE) private readonly families: QuotationFamilyStore,
    @Inject(RFQ_STORE) private readonly rfqs: RfqStore,
    private readonly fx: ExchangeRateService,
  ) {}

  /**
   * Resolve one currency for the comparison, once.
   *
   * Cached per call so every offer in that currency is valued at the SAME rate. Two lines in one
   * comparison converted at different rates would be a defect that is nearly invisible.
   */
  private async resolveFx(
    tenantId: Id, currency: string | null, context: ComparisonContext, cache: Map<string, ResolvedFx>,
  ): Promise<ResolvedFx> {
    if (!currency) return { status: 'unknown', reason: 'currency_unknown' };
    const key = currency.trim().toUpperCase();
    const cached = cache.get(key);
    if (cached) return cached;
    const resolved = await this.fx.resolveGovernedRate(tenantId, key, context.baseCurrency, new Date(context.comparisonDate));
    const fact: ResolvedFx = resolved.status === 'governed'
      ? { status: 'governed', rate: resolved.rate, source: resolved.source, effectiveDate: resolved.effectiveDate, rateId: resolved.rateId }
      : { status: 'unknown', reason: resolved.reason };
    cache.set(key, fact);
    return fact;
  }

  /** A supplier who has quoted, but whose current offer is not there to compare. */
  private absent(supplierName: string, supplierId: string | null, reason: string, requested: { quantity: number | null; uom: string | null }): NormalisedRequirementLine {
    const missing = { status: 'unknown' as const, reason: 'not_quoted' as const, missingInputs: ['quotationRevision.status'] };
    return {
      quotationLineId: null, supplierId, supplierName,
      provenance: null, notComparableReason: reason,
      requestedQuantity: requested.quantity, requestedUom: requested.uom,
      quotedQuantity: null, quotedUom: null, quantityDeviation: null, coverageRatio: null,
      quantityCompliance: 'unknown',
      normalisedUnitPrice: missing, normalisedRequestedLineTotal: missing,
      commercialStatus: 'validity_unknown', validityDate: null,
    };
  }

  /**
   * The comparison for one requirement.
   *
   * `context` is required in full: the caller states the base currency and the comparison date, and
   * every value carries the date it was computed under so the same read tomorrow is recognisably the
   * same read.
   */
  async compareRequirement(
    tenantId: Id,
    prLineId: Id,
    context: ComparisonContext,
  ): Promise<{
    prLineId: Id;
    requestedQuantity: number | null;
    requestedUom: string | null;
    materialCode: string | null;
    materialName: string | null;
    context: ComparisonContext;
    offers: NormalisedRequirementLine[];
    quotations: QuotationCommercialComponents[];
  }> {
    const requirement = await this.prLines.find(prLineId, tenantId);
    if (!requirement) throw new Error(`requisition line ${prLineId} not found`);

    const requested = { quantity: requirement.quantity ?? null, uom: requirement.uom ?? null };
    const fxCache = new Map<string, ResolvedFx>();
    const offers: NormalisedRequirementLine[] = [];
    const quotations: QuotationCommercialComponents[] = [];

    /**
     * Start from the requisition's RFQs and walk every supplier's family — not from the LINES.
     *
     * Starting from the lines would silently omit a supplier whose current revision happens to carry
     * no line for this requirement, and omitting a supplier is exactly what this must not do. A
     * requisition line knows its requisition (`prId`); the RFQs raised against that requisition are
     * what the families hang from.
     */
    const rfqs = await this.rfqs.listByPrIds(tenantId, [requirement.prId]);
    const familyRecords = [];
    for (const rfq of rfqs) familyRecords.push(...await this.families.listFamiliesByRfq(tenantId, rfq.id));

    for (const family of familyRecords) {
      for (const offer of await this.families.listOffers(tenantId, family.id)) {
        const revisions = await this.families.listRevisions(tenantId, offer.id);
        const current: QuotationRevision | null = effectiveRevision(revisions);

        if (!current) {
          // Visible, not filtered. The buyer sees the supplier and why there is nothing to compare.
          offers.push(this.absent(family.supplierName, family.supplierId, noEffectiveRevisionReason(revisions), requested));
          continue;
        }

        const fx = await this.resolveFx(tenantId, current.currency, context, fxCache);
        quotations.push(quotationCommercialComponents(current, family.supplierName, fx, context));

        const provenance: RevisionProvenance = {
          familyId: family.id,
          supplierQuotationRef: family.supplierQuotationRef,
          offerId: offer.id, offerKind: offer.kind, offerLabel: offer.label,
          revisionId: current.id, revisionNo: current.revisionNo,
          supplierRevisionRef: current.supplierRevisionRef, receivedAt: current.receivedAt,
        };

        const lines = await this.quotationLines.listByRevision(tenantId, current.id);
        const answer = lines.find((l) => l.prLineId === prLineId);
        if (!answer) {
          // The supplier's current offer says nothing about THIS requirement. An omitted line is
          // UNKNOWN, not a zero and not a no-bid — silence and refusal are different facts.
          offers.push({
            ...this.absent(family.supplierName, family.supplierId,
              `revision ${current.revisionNo} does not answer this requirement`, requested),
            provenance,
            commercialStatus: commercialStatus(current, context),
            validityDate: current.validityDate,
          });
          continue;
        }

        offers.push(normaliseRequirementLine({
          line: answer,
          revision: current,
          supplierName: family.supplierName,
          supplierId: family.supplierId,
          provenance,
          requestedQuantity: requested.quantity,
          requestedUom: requested.uom,
          fx,
          context,
        }));
      }
    }

    const comparable = offers.filter((o) => o.normalisedUnitPrice.status === 'comparable').length;
    this.logger.log(`Requirement ${prLineId}: ${offers.length} offer(s), ${comparable} comparable on ${context.comparisonDate}`);

    return {
      prLineId,
      requestedQuantity: requested.quantity,
      requestedUom: requested.uom,
      materialCode: requirement.materialCode ?? null,
      materialName: requirement.materialName ?? null,
      context,
      // In the order the quotations were opened. NOT sorted by price: an ordering IS a
      // recommendation, and this service does not make one.
      offers,
      quotations,
    };
  }
}
