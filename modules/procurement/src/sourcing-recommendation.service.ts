import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AccessService, EVENT_STORE, type EventStore } from '@aura/core';
import { makeEvent, newId, type Id } from '@aura/shared';
import { CommercialComparisonService } from './commercial-comparison.service';
import { PR_LINE_STORE, type PurchaseRequestLineStore } from './purchase-request-line-store';
import { QUOTATION_FAMILY_STORE, type QuotationFamilyStore } from './quotation-family.store';
import { QUOTATION_LINE_STORE, type QuotationLineStore } from './quotation-line.store';
import { QUOTATION_LINE_EVALUATION_STORE, type QuotationLineEvaluationStore } from './quotation-line-evaluation.store';
import { RFQ_STORE, type RfqStore } from './rfq-store';
import { technicalEligibility } from './domain/quotation-line-evaluation';
import { effectiveRevision } from './domain/quotation-family';
import type { NormalisedCommercialValue } from './domain/commercial-normalisation';
import {
  aStatus,
  makeSourcingRecommendation,
  offerRecommendability,
  reasonRequired,
  recommendationStaleness,
  selectionCoverage,
  wholeOfferTotal,
  type Recommendability,
  type RecommendationReasonCode,
  type RecommendationMode,
  type RecommendationSelection,
  type SourcingRecommendation,
  type Staleness,
  type WholeOfferTotal,
} from './domain/sourcing-recommendation';
import { SOURCING_RECOMMENDATION_STORE, type SourcingRecommendationStore } from './sourcing-recommendation.store';

/**
 * SUP-13 — the governed sourcing recommendation.
 *
 * AURA ASSEMBLES; A BUYER DECIDES. `prepare` gathers every supplier's current offer with its
 * comparable values, technical compliance, whole-offer total, validity and terms, and says of each
 * whether it MAY be recommended and why not. It names no winner and sorts nothing by price: an
 * ordering is a recommendation under another name.
 *
 * MAKER AND CHECKER ARE DIFFERENT PEOPLE, and the split is intended here rather than inherited from
 * how a route path happened to derive a permission. The Buyer prepares and submits; the Procurement
 * Manager approves, rejects or returns.
 */
export const RECOMMENDATION_EVENT = {
  prepared: 'procurement.recommendation.prepared',
  submitted: 'procurement.recommendation.submitted',
  decided: 'procurement.recommendation.decided',
} as const;

export interface OfferCandidate {
  familyId: Id;
  offerId: Id;
  offerKind: 'base' | 'alternative';
  offerLabel: string | null;
  supplierName: string;
  supplierId: Id | null;
  revisionId: Id | null;
  revisionNo: number | null;
  supplierQuotationRef: string | null;
  currency: string | null;
  paymentTerms: string | null;
  freightTerms: string | null;
  validityDate: string | null;
  commercialStatus: 'live' | 'expired' | 'validity_unknown';
  /** The requisition lines this offer actually prices, with its comparable line totals. */
  pricedPrLineIds: Id[];
  wholeOfferTotal: WholeOfferTotal;
  /** SUP-01's verdict per requisition line this offer answers. */
  technicalByLine: Record<string, 'eligible' | 'not_eligible' | 'unknown'>;
  /** May this be recommended for EVERY requirement, and if not, why not. */
  recommendability: Recommendability;
}

export interface RecommendationContext {
  baseCurrency: string;
  comparisonDate: string;
}

@Injectable()
export class SourcingRecommendationService {
  private readonly logger = new Logger('SourcingRecommendation');

  constructor(
    @Inject(SOURCING_RECOMMENDATION_STORE) private readonly store: SourcingRecommendationStore,
    @Inject(RFQ_STORE) private readonly rfqs: RfqStore,
    @Inject(PR_LINE_STORE) private readonly prLines: PurchaseRequestLineStore,
    @Inject(QUOTATION_FAMILY_STORE) private readonly families: QuotationFamilyStore,
    @Inject(QUOTATION_LINE_STORE) private readonly lines: QuotationLineStore,
    @Inject(QUOTATION_LINE_EVALUATION_STORE) private readonly evaluations: QuotationLineEvaluationStore,
    private readonly comparison: CommercialComparisonService,
    private readonly access: AccessService,
    @Optional() @Inject(EVENT_STORE) private readonly events: EventStore | null = null,
  ) {}

  private async emit(type: string, r: SourcingRecommendation, actorId: Id | null, payload: Record<string, unknown>): Promise<void> {
    if (!this.events) return;
    await this.events.append([makeEvent({
      type, tenantId: r.tenantId, companyId: r.companyId, actorId,
      aggregateType: 'procurement.sourcing_recommendation', aggregateId: r.id, payload,
    })]);
  }

  private async requirements(tenantId: Id, rfqId: Id) {
    const rfq = await this.rfqs.get(rfqId);
    if (!rfq || rfq.tenantId !== tenantId) throw new Error(`RFQ ${rfqId} not found`);
    if (!rfq.prId) throw new Error(`RFQ ${rfqId} answers no requisition, so there is nothing to source`);
    return { rfq, lines: await this.prLines.listForRequest(rfq.prId, tenantId) };
  }

  /**
   * WHAT AURA PRODUCES BEFORE ANYBODY DECIDES.
   *
   * Every supplier's current offer, valued through the SAME comparison the buyer reads on screen —
   * not recomputed here, because two paths to one number is two numbers that can disagree.
   */
  async prepare(tenantId: Id, rfqId: Id, context: RecommendationContext): Promise<{
    rfqId: Id;
    context: RecommendationContext;
    requirements: Array<{ prLineId: Id; materialCode: string | null; materialName: string | null; quantity: number | null; uom: string | null }>;
    candidates: OfferCandidate[];
  }> {
    const { lines: requirementLines } = await this.requirements(tenantId, rfqId);
    const requirementIds = requirementLines.map((l) => l.id);

    // One governed comparison per requirement, then pivoted by offer. Reusing SUP-06 rather than
    // re-deriving is the point: the recommendation is made on exactly the figures the buyer saw.
    const lineTotalsByOffer = new Map<string, NormalisedCommercialValue[]>();
    const pricedByOffer = new Map<string, Id[]>();
    for (const requirement of requirementLines) {
      const comparison = await this.comparison.compareRequirement(tenantId, requirement.id, context);
      for (const offer of comparison.offers) {
        if (!offer.provenance) continue;
        const key = offer.provenance.offerId;
        if (!lineTotalsByOffer.has(key)) { lineTotalsByOffer.set(key, []); pricedByOffer.set(key, []); }
        lineTotalsByOffer.get(key)!.push(offer.normalisedRequestedLineTotal);
        pricedByOffer.get(key)!.push(requirement.id);
      }
    }

    const candidates: OfferCandidate[] = [];
    const rfq = await this.rfqs.get(rfqId);
    for (const family of await this.families.listFamiliesByRfq(tenantId, rfq!.id)) {
      for (const offer of await this.families.listOffers(tenantId, family.id)) {
        const revisions = await this.families.listRevisions(tenantId, offer.id);
        const current = effectiveRevision(revisions);

        const quotationComponents = current
          ? (await this.comparison.compareRequirement(tenantId, requirementIds[0], context))
              .quotations.find((q) => q.quotationId === current.id) ?? null
          : null;

        const totals = lineTotalsByOffer.get(offer.id) ?? [];
        const whole = current
          ? wholeOfferTotal({
              lineTotals: totals,
              freight: quotationComponents?.freight ?? null,
              currency: context.baseCurrency,
              comparisonDate: context.comparisonDate,
            })
          : { status: 'unknown' as const, reason: 'line_total_unknown' as const, detail: 'this supplier has no current offer' };

        // SUP-01's verdict for each line of the CURRENT revision. A verdict on a superseded revision
        // does not carry forward: it was a judgement about a different offer.
        const technicalByLine: Record<string, 'eligible' | 'not_eligible' | 'unknown'> = {};
        if (current) {
          for (const line of await this.lines.listByRevision(tenantId, current.id)) {
            technicalByLine[line.prLineId] = technicalEligibility(await this.evaluations.findCurrent(tenantId, line.id));
          }
        }

        candidates.push({
          familyId: family.id, offerId: offer.id, offerKind: offer.kind, offerLabel: offer.label,
          supplierName: family.supplierName, supplierId: family.supplierId,
          revisionId: current?.id ?? null, revisionNo: current?.revisionNo ?? null,
          supplierQuotationRef: family.supplierQuotationRef,
          currency: current?.currency ?? null,
          paymentTerms: current?.paymentTerms ?? null,
          freightTerms: current?.freightTerms ?? null,
          validityDate: current?.validityDate ?? null,
          commercialStatus: quotationComponents?.commercialStatus ?? 'validity_unknown',
          pricedPrLineIds: pricedByOffer.get(offer.id) ?? [],
          wholeOfferTotal: whole,
          technicalByLine,
          recommendability: offerRecommendability({
            hasEffectiveRevision: current !== null,
            technicalByLine,
            coveredPrLineIds: requirementIds,
            wholeTotal: whole,
            commercialStatus: quotationComponents?.commercialStatus ?? 'validity_unknown',
          }),
        });
      }
    }

    return {
      rfqId,
      context,
      requirements: requirementLines.map((l) => ({
        prLineId: l.id, materialCode: l.materialCode ?? null, materialName: l.materialName ?? null,
        quantity: l.quantity ?? null, uom: l.uom ?? null,
      })),
      // In the order quotations were opened. NOT sorted by price — SUP-13 records a decision, it
      // does not make one, and an ordering is a recommendation wearing a different name.
      candidates,
    };
  }

  /** The Buyer's recommendation, as a draft. Refuses anything that is not recommendable. */
  async prepareDraft(tenantId: Id, input: {
    rfqId: Id;
    companyId?: Id | null;
    context: RecommendationContext;
    mode: RecommendationMode;
    reasonCode?: RecommendationReasonCode | null;
    reason?: string | null;
    selections: Array<{ offerId: Id; coveredPrLineIds: Id[] }>;
    createdBy?: Id | null;
  }): Promise<{ recommendation: SourcingRecommendation; selections: RecommendationSelection[] }> {
    const { lines: requirementLines } = await this.requirements(tenantId, input.rfqId);
    const requirementIds = requirementLines.map((l) => l.id);
    const assembled = await this.prepare(tenantId, input.rfqId, input.context);

    if (input.selections.length === 0) throw new Error('a recommendation must choose at least one offer');
    if (input.mode === 'single_supplier' && input.selections.length > 1) {
      throw new Error('a single-supplier recommendation must name exactly one offer — use a split award to source from several');
    }

    // THE SCOPE MUST BE WHOLE. An uncovered line vanishes from the purchase orders; a duplicated one
    // asks two suppliers to supply the same thing.
    const coverage = selectionCoverage(requirementIds, input.selections);
    if (!coverage.complete) {
      const parts = [
        coverage.uncovered.length ? `no supplier is chosen for ${coverage.uncovered.length} requisition line(s)` : '',
        coverage.duplicated.length ? `${coverage.duplicated.length} requisition line(s) are assigned to more than one supplier` : '',
      ].filter(Boolean);
      // `must` is what the exception filter reads to place this as a 400: the request cannot be
      // honoured as given, which is exactly what an incomplete scope is.
      throw new Error(`a recommendation must cover every requisition line exactly once — ${parts.join('; ')}`);
    }

    const selections: RecommendationSelection[] = [];
    const recommendation = makeSourcingRecommendation({
      tenantId, companyId: input.companyId, rfqId: input.rfqId,
      comparisonDate: input.context.comparisonDate, comparisonCurrency: input.context.baseCurrency,
      mode: input.mode, reasonCode: input.reasonCode, reason: input.reason, createdBy: input.createdBy,
    });

    for (const chosen of input.selections) {
      const candidate = assembled.candidates.find((c) => c.offerId === chosen.offerId);
      if (!candidate) throw new Error(`this recommendation cannot be recorded: offer ${chosen.offerId} is not an offer against this RFQ`);

      // Recommendability is judged against THIS supplier's scope, not the whole requirement — which
      // is how a partial offer legitimately enters a split award.
      const verdict = offerRecommendability({
        hasEffectiveRevision: candidate.revisionId !== null,
        technicalByLine: candidate.technicalByLine,
        coveredPrLineIds: chosen.coveredPrLineIds,
        wholeTotal: candidate.wholeOfferTotal,
        commercialStatus: candidate.commercialStatus,
      });
      if (!verdict.recommendable) {
        throw new Error(`${candidate.supplierName} cannot be recommended: ${verdict.reasons.map((r) => r.detail).join('; ')}`);
      }

      selections.push({
        id: newId(), tenantId, recommendationId: recommendation.id,
        familyId: candidate.familyId, offerId: candidate.offerId, revisionId: candidate.revisionId!,
        supplierName: candidate.supplierName, coveredPrLineIds: chosen.coveredPrLineIds,
        governedTotal: candidate.wholeOfferTotal.status === 'known' ? candidate.wholeOfferTotal.value : null,
        governedTotalBasis: candidate.wholeOfferTotal.status === 'known'
          ? `ex-tax, ${candidate.wholeOfferTotal.includesFreight ? 'including' : 'excluding'} freight, in ${input.context.baseCurrency} at ${input.context.comparisonDate}`
          : null,
        technicalStatus: 'eligible',
        commercialStatus: candidate.commercialStatus,
        createdAt: new Date().toISOString(),
      });
    }

    /**
     * A REASON WHERE ONE IS OWED. Whenever the choice is not the lowest governed total, and always
     * for a split. Not friction: a departure from the cheapest option is the thing a reviewer most
     * needs explained, and an unexplained one is indistinguishable from a mistake.
     */
    const chosenTotal = selections.reduce<number | null>(
      (sum, s) => (sum === null || s.governedTotal === null ? null : sum + s.governedTotal), 0);
    const available = assembled.candidates
      .filter((c) => c.recommendability.recommendable && c.wholeOfferTotal.status === 'known')
      .map((c) => (c.wholeOfferTotal as { value: number }).value);
    const lowest = available.length > 0 ? Math.min(...available) : null;

    if (reasonRequired({ mode: input.mode, chosenTotal, lowestAvailableTotal: lowest })
        && !(input.reasonCode && input.reason?.trim())) {
      throw new Error(
        input.mode === 'split_award'
          ? 'a split award must record why the requirement is being sourced from more than one supplier'
          : 'this offer is not the lowest governed total, so the recommendation must record why it was chosen',
      );
    }

    await this.store.create(recommendation, selections);
    await this.emit(RECOMMENDATION_EVENT.prepared, recommendation, input.createdBy ?? null, {
      rfqId: input.rfqId, mode: input.mode,
      suppliers: selections.map((s) => ({ supplierName: s.supplierName, revisionId: s.revisionId, governedTotal: s.governedTotal })),
    });
    this.logger.log(`Recommendation prepared for RFQ ${input.rfqId}: ${input.mode}, ${selections.length} supplier(s)`);
    return { recommendation, selections };
  }

  /** Read a recommendation with its selections, and whether the ground has moved under it. */
  async read(tenantId: Id, id: Id): Promise<{
    recommendation: SourcingRecommendation;
    selections: RecommendationSelection[];
    staleness: Staleness;
  }> {
    const recommendation = await this.store.get(tenantId, id);
    if (!recommendation) throw new Error(`recommendation ${id} not found`);
    const selections = await this.store.listSelections(tenantId, id);

    const current: Record<string, { revisionId: string } | null> = {};
    for (const selection of selections) {
      const effective = await this.families.findConfirmedRevision(tenantId, selection.offerId);
      current[selection.offerId] = effective ? { revisionId: effective.id } : null;
    }
    return { recommendation, selections, staleness: recommendationStaleness(selections, current) };
  }

  /** The Buyer submits it for approval. A stale recommendation is refused rather than submitted. */
  async submit(tenantId: Id, id: Id, actorId?: Id | null): Promise<SourcingRecommendation> {
    const { recommendation, staleness } = await this.read(tenantId, id);
    if (recommendation.status !== 'draft' && recommendation.status !== 'returned') {
      throw new Error(`${aStatus(recommendation.status)} recommendation cannot be submitted`);
    }
    if (staleness.stale) {
      throw new Error(`this recommendation is out of date and cannot be submitted: ${staleness.affected.map((a) => a.detail).join('; ')}`);
    }
    const submitted: SourcingRecommendation = {
      ...recommendation, status: 'submitted',
      submittedBy: actorId ?? null, submittedAt: new Date().toISOString(),
    };
    await this.store.updateStatus(submitted);
    await this.emit(RECOMMENDATION_EVENT.submitted, submitted, actorId ?? null, { rfqId: submitted.rfqId });
    return submitted;
  }

  /**
   * THE PROCUREMENT MANAGER'S DECISION, with the approval matrix checked on the ACTUAL award value.
   *
   * TWO CHECKS, DELIBERATELY. Each supplier's own award must be within the approver's authority, AND
   * so must the whole sourcing decision — otherwise an award beyond somebody's limit could be waved
   * through by splitting it into several smaller purchase orders, which is precisely the control
   * an approval limit exists to impose.
   *
   * Note the consequence, which is intended: an approver whose limit clears each purchase order
   * individually can still be refused on the total.
   */
  async decide(tenantId: Id, id: Id, input: {
    decision: 'approved' | 'rejected' | 'returned';
    note?: string | null;
    actorId: Id;
  }): Promise<SourcingRecommendation> {
    const { recommendation, selections, staleness } = await this.read(tenantId, id);
    if (recommendation.status !== 'submitted') {
      throw new Error(`${aStatus(recommendation.status)} recommendation is not awaiting a decision`);
    }
    if (recommendation.submittedBy && recommendation.submittedBy === input.actorId) {
      throw new Error('the person who submitted a recommendation cannot approve it — a second pair of eyes is the point');
    }
    if (input.decision === 'approved' && staleness.stale) {
      throw new Error(`this recommendation is out of date and cannot be approved: ${staleness.affected.map((a) => a.detail).join('; ')}`);
    }

    if (input.decision === 'approved') {
      /**
       * The org path the approval limit is read against: tenant, then company when the RFQ has one.
       * The permission named is the award itself — `procurement.rfq.award` is what an approver is
       * exercising, and asking about anything else would check the wrong authority.
       */
      const orgPath: Array<{ level: 'tenant' | 'company'; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (recommendation.companyId) orgPath.push({ level: 'company', id: recommendation.companyId });
      const target = { permission: 'procurement.rfq.award' as const, orgPath };
      for (const selection of selections) {
        if (selection.governedTotal === null) {
          throw new Error(`${selection.supplierName}'s award value is not known, so it cannot be approved`);
        }
        this.access.assertApprovalAuthority(
          input.actorId, { ...target, amount: selection.governedTotal },
          `the award to ${selection.supplierName}`,
        );
      }
      const total = selections.reduce((sum, s) => sum + (s.governedTotal ?? 0), 0);
      // The anti-splitting check. Never skipped for a single supplier: the same call twice on the
      // same figure costs nothing, and a special case is a hole waiting to be found.
      this.access.assertApprovalAuthority(
        input.actorId, { ...target, amount: total },
        'this sourcing decision in total',
      );
    }

    const decided: SourcingRecommendation = {
      ...recommendation, status: input.decision,
      decidedBy: input.actorId, decidedAt: new Date().toISOString(),
      decisionNote: input.note?.trim() || null,
    };
    await this.store.updateStatus(decided);
    await this.emit(RECOMMENDATION_EVENT.decided, decided, input.actorId, {
      rfqId: decided.rfqId, decision: input.decision,
      total: selections.reduce((sum, s) => sum + (s.governedTotal ?? 0), 0),
    });
    this.logger.log(`Recommendation ${id} ${input.decision} by ${input.actorId}`);
    return decided;
  }

  /**
   * STANDING A RECOMMENDATION DOWN.
   *
   * One live recommendation per RFQ is a real rule, and `approved` counts as live — so an approved
   * recommendation that must NOT be awarded had nowhere to go. That is not hypothetical: the award
   * refuses a recommendation that has gone stale, and a stale approved one could then neither be
   * awarded, nor decided again, nor replaced. The RFQ was stuck.
   *
   * WHO MAY DO IT FOLLOWS WHAT IS BEING UNDONE. Standing down a draft is the buyer tidying up their
   * own work. Standing down something SUBMITTED OR APPROVED is undoing a decision that went through
   * the approval, so it asks for the same authority the approval did — otherwise the maker could
   * quietly reverse their own checker.
   *
   * A REASON IS REQUIRED. "This was approved and then abandoned" is exactly the thing somebody reads
   * back six months later and needs explained.
   */
  async withdraw(tenantId: Id, id: Id, input: { actorId: Id; reason: string }): Promise<SourcingRecommendation> {
    const recommendation = await this.store.get(tenantId, id);
    if (!recommendation) throw new Error(`recommendation ${id} not found`);
    if (recommendation.status === 'awarded') {
      throw new Error('an awarded recommendation cannot be withdrawn — the purchase orders it raised are real, and cancelling those is the order’s own decision');
    }
    if (recommendation.status === 'rejected' || recommendation.status === 'withdrawn') {
      throw new Error(`${aStatus(recommendation.status)} recommendation is already closed`);
    }
    if (!input.reason?.trim()) throw new Error('withdrawing a recommendation must record why');

    if (recommendation.status === 'submitted' || recommendation.status === 'approved') {
      const orgPath: Array<{ level: 'tenant' | 'company'; id: Id }> = [{ level: 'tenant', id: tenantId }];
      if (recommendation.companyId) orgPath.push({ level: 'company', id: recommendation.companyId });
      this.access.assert(input.actorId, { permission: 'procurement.rfq.award', orgPath });
    }

    const withdrawn: SourcingRecommendation = {
      ...recommendation, status: 'withdrawn',
      decidedBy: input.actorId, decidedAt: new Date().toISOString(),
      decisionNote: input.reason.trim(),
    };
    await this.store.updateStatus(withdrawn);
    await this.emit(RECOMMENDATION_EVENT.decided, withdrawn, input.actorId, {
      rfqId: withdrawn.rfqId, decision: 'withdrawn', reason: input.reason.trim(),
    });
    this.logger.log(`Recommendation ${id} withdrawn by ${input.actorId}: ${input.reason.trim()}`);
    return withdrawn;
  }

  /** Every recommendation raised against an RFQ. Rejected and returned ones stay readable. */
  listByRfq(tenantId: Id, rfqId: Id): Promise<SourcingRecommendation[]> {
    return this.store.listByRfq(tenantId, rfqId);
  }
}
