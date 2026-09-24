import { Inject, Injectable } from '@nestjs/common';
import type { Id } from '@aura/shared';
import { PURCHASE_REQUEST_STORE, type PurchaseRequestStore } from './purchase-request-store';
import { PR_LINE_STORE, type PurchaseRequestLineStore } from './purchase-request-line-store';
import { RFQ_STORE, type RfqStore } from './rfq-store';
import { QUOTATION_LINE_STORE, type QuotationLineStore } from './quotation-line.store';
import { isTenderPricing } from './domain/purchase-request';

/**
 * ONE RULE, EVERY DOOR: a tender-pricing requisition prices a bid and buys nothing.
 *
 * It reuses procurement's own RFQ, supplier quotation, technical evaluation and commercial
 * comparison — which is why it is expressed as a requisition at all — and it must never reach an
 * order. Measured before this existed, there were more doors than it looked:
 *
 *   * approving a requisition AUTOMATICALLY DRAFTS A PURCHASE ORDER;
 *   * the sourcing award raises orders from an approved recommendation;
 *   * and order LINES carry `sourcePrLineId` / `sourceQuoteLineId` taken from the request body, so
 *     an ordinary order with no requisition on its header could still carry a line naming pricing
 *     quotations — the door a header check never sees.
 *
 * Every one of those services asks THIS, so the rule is written once. Migration 0387 enforces the
 * same boundary in PostgreSQL, so a code path nobody has written yet, or a direct write, is refused
 * too. The two are deliberately worded differently, so a refusal can be traced to the layer that
 * made it: this one says "raising…", the database says "…is not buying for it".
 *
 * Every message is phrased onto the error taxonomy's 409 shape (`is not allowed for`), because a
 * refused purchase is a conflict with the record's nature, not bad input.
 */
@Injectable()
export class TenderPricingBoundary {
  constructor(
    @Inject(PURCHASE_REQUEST_STORE) private readonly requests: PurchaseRequestStore,
    @Inject(PR_LINE_STORE) private readonly requestLines: PurchaseRequestLineStore,
    @Inject(RFQ_STORE) private readonly rfqs: RfqStore,
    @Inject(QUOTATION_LINE_STORE) private readonly quotationLines: QuotationLineStore,
  ) {}

  private async pricingRequisition(prId: Id | null | undefined): Promise<{ id: Id; reference: string | null } | null> {
    if (!prId) return null;
    const pr = await this.requests.get(prId);
    return pr && isTenderPricing(pr) ? { id: pr.id, reference: pr.reference } : null;
  }

  private label(pr: { id: Id; reference: string | null }): string {
    return pr.reference ?? pr.id;
  }

  /** The requisition itself: no submission, no approval — approval is what drafts an order. */
  async assertMayEnterApproval(prId: Id): Promise<void> {
    const pr = await this.pricingRequisition(prId);
    if (pr) {
      throw new Error(
        `submitting or approving is not allowed for tender-pricing requisition ${this.label(pr)} — ` +
          'it can only be a draft: it prices a bid, and approving it would draft a purchase order',
      );
    }
  }

  /** The order HEADER door: approval, award, or a direct order naming the requisition or its RFQ. */
  async assertMayRaiseOrder(input: { prId?: Id | null; rfqId?: Id | null }, tenantId: Id): Promise<void> {
    const direct = await this.pricingRequisition(input.prId);
    const viaRfq = !direct && input.rfqId ? await this.pricingRequisitionOfRfq(input.rfqId, tenantId) : null;
    const pr = direct ?? viaRfq;
    if (pr) {
      throw new Error(
        `raising a purchase order is not allowed for tender-pricing requisition ${this.label(pr)} — ` +
          'it prices a bid and buys nothing; buying for a won tender starts with a new operational requisition',
      );
    }
  }

  /** The order LINE door — the one a header check never sees. */
  async assertMayOrderLine(input: { sourcePrLineId?: Id | null; sourceQuoteLineId?: Id | null }, tenantId: Id): Promise<void> {
    if (input.sourcePrLineId) {
      const line = await this.requestLines.find(input.sourcePrLineId, tenantId);
      const pr = line ? await this.pricingRequisition(line.prId) : null;
      if (pr) {
        throw new Error(
          `raising a purchase order line is not allowed for tender-pricing requisition ${this.label(pr)} — ` +
            'its line prices a bid, and naming it on an order would buy what was only priced',
        );
      }
    }
    if (input.sourceQuoteLineId) {
      const quoted = await this.quotationLines.get(input.sourceQuoteLineId);
      const line = quoted && quoted.tenantId === tenantId ? await this.requestLines.find(quoted.prLineId, tenantId) : null;
      const pr = line ? await this.pricingRequisition(line.prId) : null;
      if (pr) {
        throw new Error(
          `raising a purchase order line is not allowed for tender-pricing requisition ${this.label(pr)} — ` +
            'that supplier quotation was asked for to price a bid, not to be bought from',
        );
      }
    }
  }

  /**
   * The RECOMMENDATION door. The commercial comparison stays open — it is how a bid gets its supplier
   * prices. A recommendation exists to authorise an award, and an award raises orders.
   */
  async assertMayRecommend(rfqId: Id, tenantId: Id): Promise<void> {
    const pr = await this.pricingRequisitionOfRfq(rfqId, tenantId);
    if (pr) {
      throw new Error(
        `recommending an award is not allowed for tender-pricing requisition ${this.label(pr)} — ` +
          'its commercial comparison prices a bid; a recommendation authorises a purchase',
      );
    }
  }

  private async pricingRequisitionOfRfq(rfqId: Id, tenantId: Id): Promise<{ id: Id; reference: string | null } | null> {
    const rfq = await this.rfqs.get(rfqId);
    if (!rfq || rfq.tenantId !== tenantId) return null;
    return this.pricingRequisition(rfq.prId);
  }
}
