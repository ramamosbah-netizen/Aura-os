import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EVENT_STORE, type EventStore, LockService, TX_RUNNER, type TxHandle, type TxRunner } from '@aura/core';
import { makeEvent, type Id } from '@aura/shared';
import { PR_LINE_STORE, type PurchaseRequestLineStore } from './purchase-request-line-store';
import type { PurchaseRequestLine } from './domain/purchase-request-line';
import { PURCHASE_REQUEST_STORE, type PurchaseRequestStore } from './purchase-request-store';
import { PurchaseOrderService } from './purchase-order.service';
import { PO_LINE_STORE, type PurchaseOrderLineStore } from './purchase-order-line-store';
import { QUOTATION_FAMILY_STORE, type QuotationFamilyStore } from './quotation-family.store';
import { QUOTATION_LINE_STORE, type QuotationLineStore } from './quotation-line.store';
import type { QuotationLine } from './domain/quotation-line';
import { RFQ_STORE, type RfqStore } from './rfq-store';
import { SOURCING_RECOMMENDATION_STORE, type SourcingRecommendationStore } from './sourcing-recommendation.store';
import { makePurchaseOrder, type PurchaseOrder } from './domain/purchase-order';
import { orderTotal, type LineValuation } from './domain/purchase-order-line';
import { makePurchaseOrderLine } from './domain/purchase-order-line';
import { aStatus, recommendationStaleness, type RecommendationSelection } from './domain/sourcing-recommendation';

/**
 * SUP-14 — turning an APPROVED recommendation into purchase orders.
 *
 * THE ORDER IS THE SUPPLIER'S CONTRACT, NOT THE COMPARISON. A USD 100/unit offer becomes a purchase
 * order at USD 100/unit. SUP-06's normalised AED 367.25 exists so a buyer could weigh offers against
 * each other; writing it onto the order would redenominate a supplier's contract into a currency
 * they never quoted, at a rate they never agreed. The comparison rate and its provenance live on the
 * recommendation and in the event trail — evidence of how the decision was reached, never the
 * commercial authority of the order it produced.
 *
 * ONE PURCHASE ORDER PER SUPPLIER. A split award produces one per supplier, each carrying only the
 * requisition lines that supplier was recommended for. There is no ambiguity to resolve later about
 * who owes what.
 *
 * EVERY LINE IS `sourced`. The purchase-order line model already requires a sourced line to name
 * both the requisition line it answers and the quotation line it was priced from — so a price that
 * cannot be traced back to an offer cannot be written at all.
 *
 * ONE TRANSACTION, AND THREE DEFENCES AGAINST AWARDING TWICE.
 *
 * An award raises several purchase orders, their lines and their events, and moves the
 * recommendation to `awarded`. All of it commits together or none of it does — because the states
 * in between are each a real, expensive mess: one supplier ordered from and the next not, or both
 * ordered from with the decision still sitting unawarded for somebody to award again.
 *
 * Concurrency is part of correctness here, not a refinement of it. Two requests can both read
 * `approved` before either writes — the check-then-act that is safe in one process and is not safe
 * at all in two — and the result is a duplicated order to a supplier who is entitled to be paid for
 * both. So:
 *
 *   1. AN ADVISORY LOCK on the recommendation, taken inside the transaction, so the second request
 *      waits rather than reading a state the first is about to change.
 *   2. A CONDITIONAL CLAIM, `approved → awarded`, whose row count decides which request won. This is
 *      the authority: the database answers once, and the loser is told it lost.
 *   3. A UNIQUE INDEX on the recommendation SELECTION (migration 0358), so a second order for the
 *      same supplier's share of the same decision cannot be written at all — including by a future
 *      code path that forgets the first two.
 *
 * AND THE STALENESS CHECK HOLDS ITS ROWS. Reading "no newer revision has been confirmed" and then
 * awarding leaves a window for exactly that to happen in between. The revisions are read `FOR SHARE`
 * inside the transaction, so a concurrent confirmation — which must supersede the current revision
 * before it can promote the next past the partial unique index — waits for this award to finish.
 * Either it lands first and this read sees it, or it lands after an award that was true when it
 * committed.
 *
 * NOTHING COMMERCIAL IS LEFT BEHIND. The quantity, the gross unit price, the line discount, the make
 * and model offered, the tax treatment, freight and payment terms all cross from the offer to the
 * order untouched. The award used to REFUSE a discounted line, because a purchase-order line could
 * not record a discount and the alternatives were losing it or restating the unit price; PO-01 gave
 * the line a discount of its own, so a valid quotation can now reach an order whatever terms it
 * carries.
 */
/**
 * EVERY FACT THAT DECIDES WHAT AN AWARDED LINE IS WORTH, mapped in ONE place.
 *
 * The header value is computed from these before the order exists, and the order line is built from
 * the same offer line afterwards — two constructions of the same thing, which is exactly how they
 * drift. They have drifted twice already: once omitting the discount, so a discounted offer produced
 * an order whose header said the gross figure while its lines said the net one; once omitting the
 * discount's KIND, so the value could not be computed at all. Adding a field to the line's valuation
 * means adding it here, and the type stops the build until it is.
 */
const asOrderValue = (l: QuotationLine): LineValuation => ({
  quantity: l.quantity ?? 0,
  unitPrice: l.unitPrice ?? 0,
  lineDiscount: l.lineDiscount,
  lineDiscountBasis: l.lineDiscountBasis,
});

export const AWARD_EVENT = {
  awarded: 'procurement.sourcing.awarded',
} as const;

@Injectable()
export class SourcingAwardService {
  private readonly logger = new Logger('SourcingAward');

  constructor(
    @Inject(SOURCING_RECOMMENDATION_STORE) private readonly recommendations: SourcingRecommendationStore,
    @Inject(RFQ_STORE) private readonly rfqs: RfqStore,
    @Inject(PR_LINE_STORE) private readonly prLines: PurchaseRequestLineStore,
    @Inject(QUOTATION_FAMILY_STORE) private readonly families: QuotationFamilyStore,
    @Inject(QUOTATION_LINE_STORE) private readonly quotationLines: QuotationLineStore,
    /**
     * THE ORDER IS RAISED THROUGH THE ORDER SERVICE, not written to its store.
     *
     * `create` is what gives an order its PO number, emits `procurement.po.created` — which is how a
     * commitment reaches project cost and how ordered quantity reaches the ledger — writes the audit
     * entry, and refuses a supplier who is not approved in the master. An award that inserted a row
     * directly would produce an order that existed but was committed against nothing, and the gap
     * would only show up in a cost report months later.
     */
    private readonly orders: PurchaseOrderService,
    @Inject(PO_LINE_STORE) private readonly orderLines: PurchaseOrderLineStore,
    @Optional() @Inject(PURCHASE_REQUEST_STORE) private readonly requests: PurchaseRequestStore | null = null,
    /**
     * The transaction this whole award runs in, and the lock that serialises it against another
     * award of the same recommendation. Optional so a unit test can build the service without a
     * database; `NullTxRunner` then runs the same code with no transaction, which is honest about
     * what in-memory mode can and cannot promise.
     */
    @Optional() @Inject(TX_RUNNER) private readonly txRunner: TxRunner | null = null,
    @Optional() private readonly locks: LockService | null = null,
    @Optional() @Inject(EVENT_STORE) private readonly events: EventStore | null = null,
  ) {}

  /**
   * Award an approved recommendation.
   *
   * Refuses anything that is not approved, and anything that has gone stale since — a supplier who
   * sent a newer revision after approval must be looked at again, because awarding would otherwise
   * place an order on terms nobody reviewed.
   */
  async award(tenantId: Id, recommendationId: Id, actorId?: Id | null): Promise<{
    recommendation: { id: Id; rfqId: Id; mode: string };
    orders: PurchaseOrder[];
  }> {
    const lockKey = `sourcing-award:${recommendationId}`;
    const run = this.txRunner ?? { run: <T,>(fn: (tx: TxHandle | null) => Promise<T>) => fn(null) };
    return run.run(async (tx) => {
      try {
        // Taken FIRST, before anything is read: a lock acquired after the read it is meant to
        // protect protects nothing.
        if (this.locks) await this.locks.acquireLock(tx, lockKey);
        return await this.awardWithin(tx, tenantId, recommendationId, actorId ?? null);
      } finally {
        if (this.locks && !tx) this.locks.releaseInMemoryLock(lockKey);
      }
    });
  }

  private async awardWithin(
    tx: TxHandle | null, tenantId: Id, recommendationId: Id, actorId: Id | null,
  ): Promise<{ recommendation: { id: Id; rfqId: Id; mode: string }; orders: PurchaseOrder[] }> {
    const recommendation = await this.recommendations.get(tenantId, recommendationId);
    if (!recommendation) throw new Error(`recommendation ${recommendationId} not found`);
    if (recommendation.status !== 'approved') {
      throw new Error(`${aStatus(recommendation.status)} recommendation cannot be awarded — only an approved one can`);
    }

    const selections = await this.recommendations.listSelections(tenantId, recommendationId);
    if (selections.length === 0) throw new Error('this recommendation selects no offer, so there is nothing to award');

    const current: Record<string, { revisionId: string } | null> = {};
    for (const selection of selections) {
      // Held for the life of this transaction, so "not stale" is still true when it commits.
      const effective = await this.families.findConfirmedRevisionForAward(tenantId, selection.offerId, tx);
      current[selection.offerId] = effective ? { revisionId: effective.id } : null;
    }
    const staleness = recommendationStaleness(selections, current);
    if (staleness.stale) {
      throw new Error(`this recommendation is out of date and cannot be awarded: ${staleness.affected.map((a) => a.detail).join('; ')}`);
    }

    const rfq = await this.rfqs.get(recommendation.rfqId);
    if (!rfq || rfq.tenantId !== tenantId) throw new Error(`RFQ ${recommendation.rfqId} not found`);
    const requirements = rfq.prId ? await this.prLines.listForRequest(rfq.prId, tenantId) : [];
    // The project the spend is coded to. An RFQ knows only its requisition; the project comes from
    // that requisition's snapshot, never a cross-module join (ADR-0004).
    const request = rfq.prId && this.requests ? await this.requests.get(rfq.prId) : null;
    const requirementById = new Map(requirements.map((r) => [r.id, r]));

    /**
     * EVERYTHING IS CHECKED BEFORE ANYTHING IS WRITTEN.
     *
     * A split award raises one order per supplier, each through its own transaction — so a refusal
     * discovered while raising the second would leave the first standing, with the recommendation
     * still unawarded and a retry free to raise it twice. Planning the whole award first means every
     * refusal this service can make has already been made before the first write.
     */
    const plan: Array<{
      selection: RecommendationSelection;
      order: PurchaseOrder;
      lines: Array<{ quoted: QuotationLine; requirement: PurchaseRequestLine }>;
    }> = [];

    for (const selection of selections) {
      const revision = await this.families.getRevision(tenantId, selection.revisionId);
      if (!revision) throw new Error(`the offer revision this award was made on was not found — it is the one selected for ${selection.supplierName}`);
      const family = await this.families.getFamily(tenantId, selection.familyId);
      const lines = await this.quotationLines.listByRevision(tenantId, selection.revisionId);

      /**
       * ONLY the requisition lines this supplier was recommended for. In a split award the other
       * supplier's lines belong on the other order, and copying an offer's whole price list would
       * order things from somebody who was not chosen to supply them.
       */
      const awarded = lines.filter((l) => selection.coveredPrLineIds.includes(l.prLineId) && l.response === 'quoted');
      if (awarded.length === 0) {
        throw new Error(`this award cannot be raised: ${selection.supplierName}'s offer prices none of the requisition lines it was recommended for`);
      }

      const planned: Array<{ quoted: QuotationLine; requirement: PurchaseRequestLine }> = [];
      for (const quoted of awarded) {
        const requirement = requirementById.get(quoted.prLineId);
        if (!requirement) throw new Error(`this line cannot be ordered: requisition line ${quoted.prLineId} is not on this RFQ's requisition`);
        planned.push({ quoted, requirement });
      }

      /**
       * THE ORDER VALUE IS IN THE SUPPLIER'S OWN CURRENCY, derived from the lines they quoted — not
       * the governed comparison total, which is in the comparison currency at a rate the supplier
       * never agreed to.
       *
       * IT IS EXACTLY WHAT THE LINES COME TO. `orderGoverningValue` says an order with lines is
       * governed by its lines, so a header figure that also included freight would be a second total
       * disagreeing with the first the moment anybody read the order two ways. Freight is carried on
       * the header as the supplier quoted it — stated beside the value, not folded into it and not
       * spread across the lines, which would invent a per-item cost nobody quoted.
       */
      const value = orderTotal(awarded.map(asOrderValue)).value;

      plan.push({
        selection,
        lines: planned,
        order: makePurchaseOrder({
          tenantId,
          companyId: recommendation.companyId,
          title: `PO — ${rfq.title} — ${selection.supplierName}`,
          supplierId: family?.supplierId ?? null,
          supplierName: selection.supplierName,
          projectId: request?.projectId ?? null,
          projectName: request?.projectName ?? null,
          rfqId: rfq.id,
          prId: rfq.prId ?? null,
          value,
          status: 'draft',
          createdBy: actorId ?? null,
          // The supplier's own terms, carried across rather than retyped or recomputed.
          currency: revision.currency,
          sourcingRecommendationId: recommendation.id,
          quotationRevisionId: revision.id,
          supplierQuotationRef: family?.supplierQuotationRef ?? null,
          taxTreatment: revision.taxTreatment,
          taxRatePct: revision.taxRatePct,
          freightAmount: revision.freightAmount,
          freightTerms: revision.freightTerms,
          paymentTerms: revision.paymentTerms,
        }),
      });
    }

    const raised: PurchaseOrder[] = [];

    for (const { selection, order, lines: planned } of plan) {
      /**
       * Raised INSIDE this award's transaction, so a refusal on the next supplier takes this order
       * back out with it. `recommendationSelectionId` is what the unique index keys on: one order
       * per supplier's share of one decision, enforced by the database rather than by this loop.
       */
      const raisedOrder = await this.orders.raise(tx, { ...order, recommendationSelectionId: selection.id });
      raised.push(raisedOrder);

      let lineNo = 1;
      for (const { quoted, requirement } of planned) {
        await this.orderLines.saveWithClient(tx, makePurchaseOrderLine({
          tenantId,
          companyId: recommendation.companyId ?? null,
          poId: raisedOrder.id,
          lineNo: lineNo++,
          materialId: requirement.materialId,
          snapshot: {
            materialCode: requirement.materialCode,
            materialName: requirement.materialName,
            specification: requirement.specification ?? null,
            // The MAKE AND MODEL THE SUPPLIER OFFERED, not the ones the requisition asked for: the
            // order is for what was quoted and accepted.
            manufacturer: quoted.offeredManufacturer,
            model: quoted.offeredModel,
            uom: quoted.uom ?? requirement.uom,
          },
          ...asOrderValue(quoted),
          // IN THE SUPPLIER'S CURRENCY. The GROSS per-unit figure, exactly as quoted, because that
          // is what the supplier will print on their invoice line and what a three-way match will
          // compare against. The discount travels beside it (PO-01) rather than being folded in —
          // folding it would restate a price the supplier never gave and make their invoice look
          // wrong against our own order. The discount travels beside it with the KIND of discount
          // it is, because what it is worth when half the line arrives depends on that and the order
          // must not have to guess. Its provenance is `sourceQuoteLineId` below: the quotation line
          // it came from, still readable.
          // AGREED, not an estimate: this price was quoted by the supplier and accepted through a
          // governed recommendation that somebody with the authority to commit it approved.
          unitPriceBasis: 'agreed',
          sourceType: 'sourced',
          sourcePrLineId: quoted.prLineId,
          sourceQuoteLineId: quoted.id,
          notes: quoted.notes,
        }));
      }

      this.logger.log(
        `Awarded ${selection.supplierName} -> PO ${raisedOrder.reference ?? raisedOrder.id}: ` +
        `${planned.length} line(s), ${raisedOrder.value} ${raisedOrder.currency ?? 'currency not stated'}`,
      );
    }

    /**
     * THE CLAIM, and the only thing that decides who won. `approved → awarded` as a conditional
     * update: if another request got here first this returns false, and throwing rolls back every
     * order raised above. The advisory lock means that should not happen; this is what makes it not
     * matter if it does.
     */
    const claimed = await this.recommendations.claimForAward(tenantId, recommendationId, actorId, tx);
    if (!claimed) {
      throw new Error(
        'this recommendation was already awarded by someone else while this award was being ' +
        'prepared — read it again before acting, because those purchase orders exist',
      );
    }

    if (this.events) {
      // In the same transaction as the orders it describes: an audit trail that can outlive a
      // rolled-back award is a record of something that did not happen.
      await this.events.appendWithClient(tx, [makeEvent({
        type: AWARD_EVENT.awarded,
        tenantId, companyId: recommendation.companyId, actorId: actorId ?? null,
        aggregateType: 'procurement.sourcing_recommendation', aggregateId: recommendation.id,
        payload: {
          rfqId: recommendation.rfqId,
          mode: recommendation.mode,
          // The comparison basis is recorded as EVIDENCE of how the decision was reached — never as
          // the orders' commercial authority, which is each supplier's own currency and terms.
          comparisonBasis: {
            comparisonDate: recommendation.comparisonDate,
            comparisonCurrency: recommendation.comparisonCurrency,
            governedTotals: selections.map((s) => ({ supplierName: s.supplierName, governedTotal: s.governedTotal })),
          },
          orders: raised.map((o) => ({
            poId: o.id, supplierName: o.supplierName, value: o.value, currency: o.currency,
          })),
        },
      })]);
    }

    return {
      recommendation: { id: recommendation.id, rfqId: recommendation.rfqId, mode: recommendation.mode },
      orders: raised,
    };
  }
}
