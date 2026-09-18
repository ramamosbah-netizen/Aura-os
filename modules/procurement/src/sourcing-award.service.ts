import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EVENT_STORE, type EventStore } from '@aura/core';
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
import { orderTotal, type PurchaseOrderLine } from './domain/purchase-order-line';
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
 */
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
    @Optional() @Inject(PURCHASE_REQUEST_STORE) private readonly requests: PurchaseRequestStore | null = null,
    @Inject(PO_LINE_STORE) private readonly orderLines: PurchaseOrderLineStore,
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
    const recommendation = await this.recommendations.get(tenantId, recommendationId);
    if (!recommendation) throw new Error(`recommendation ${recommendationId} not found`);
    if (recommendation.status !== 'approved') {
      throw new Error(`${aStatus(recommendation.status)} recommendation cannot be awarded — only an approved one can`);
    }

    const selections = await this.recommendations.listSelections(tenantId, recommendationId);
    if (selections.length === 0) throw new Error('this recommendation selects no offer, so there is nothing to award');

    const current: Record<string, { revisionId: string } | null> = {};
    for (const selection of selections) {
      const effective = await this.families.findConfirmedRevision(tenantId, selection.offerId);
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

      /**
       * A DISCOUNT THE ORDER CANNOT RECORD IS REFUSED, NOT DROPPED.
       *
       * A purchase-order line has a quantity and a unit price and no discount field, and the order's
       * governing value is `orderTotal` — the sum of quantity x unit price. So an offer line with a
       * discount could only be awarded by losing the discount (ordering at more than was agreed) or
       * by folding it into the unit price (restating the per-unit figure the supplier will invoice,
       * and breaking the three-way match against their invoice). Both are wrong the same way: the
       * order would state a price nobody agreed to.
       *
       * So it refuses, and says exactly what is missing. Recording a discount on an order line is a
       * real gap — it also has to answer what a discounted line is worth when it is received and
       * matched — and inventing that answer inside an award is not the place to do it.
       */
      const discounted = awarded.filter((l) => (l.lineDiscount ?? 0) !== 0);
      if (discounted.length > 0) {
        throw new Error(
          `a purchase order line cannot record a discount, and ${selection.supplierName}'s offer gives one on ` +
          `${discounted.length} line(s) — awarding it would either lose the discount or restate the unit price the ` +
          'supplier will invoice. Ask the supplier to re-quote the net unit price, or record the discount on the ' +
          'order once order lines can carry one.',
        );
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
      const value = orderTotal(
        awarded.map((l) => ({ quantity: l.quantity ?? 0, unitPrice: l.unitPrice ?? 0 }) as PurchaseOrderLine),
      ).value;

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
       * IDEMPOTENT PER SELECTION. The key names the recommendation and the selection, so a retry
       * after a failure part-way through a split award returns the order already raised for that
       * supplier instead of raising a second one for the same award.
       */
      const raisedOrder = await this.orders.create(order, `sourcing-award:${recommendation.id}:${selection.id}`);
      raised.push(raisedOrder);

      // Same reason: an order that already carries its lines is not given them a second time.
      const existing = await this.orderLines.listForOrder(raisedOrder.id, tenantId);
      if (existing.length > 0) continue;

      let lineNo = 1;
      for (const { quoted, requirement } of planned) {
        await this.orderLines.save(makePurchaseOrderLine({
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
          quantity: quoted.quantity ?? 0,
          // IN THE SUPPLIER'S CURRENCY. This is the number the supplier will invoice against.
          unitPrice: quoted.unitPrice ?? 0,
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

    await this.recommendations.updateStatus({ ...recommendation, status: 'awarded' });

    if (this.events) {
      await this.events.append([makeEvent({
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
