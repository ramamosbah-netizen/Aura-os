import { describe, expect, it, beforeEach } from 'vitest';
import { newId } from '@aura/shared';
import { makePurchaseRequest } from './domain/purchase-request';
import { makePurchaseRequestLine } from './domain/purchase-request-line';
import { makeRfq } from './domain/rfq';
import { makeQuotationLine } from './domain/quotation-line';
import { InMemoryPurchaseRequestStore } from './in-memory-purchase-request-store';
import { InMemoryPurchaseRequestLineStore } from './in-memory-purchase-request-line-store';
import { InMemoryRfqStore } from './in-memory-rfq-store';
import { InMemoryQuotationLineStore } from './in-memory-quotation-line-store';
import { TenderPricingBoundary } from './tender-pricing-boundary.service';

/**
 * THE TENDER-PRICING BOUNDARY, at the service layer. The database enforces the same boundary
 * (tender-pricing-boundary.pg.test.ts); this proves every service door asks the one rule, and that
 * it refuses by the service's own words — so an API refusal can be traced to the layer that made it.
 */

const T = 'tenant-1';

describe('what a requisition is for', () => {
  const pricing = { tenantId: T, title: 'Pricing', purpose: 'tender_pricing' as const, sourceTenderId: 'tender-1', sourceBasisRevisionId: 'rev-1' };

  it('makes a pricing requisition that names its tender and basis, and has no project', () => {
    const pr = makePurchaseRequest(pricing);
    expect(pr).toMatchObject({ purpose: 'tender_pricing', sourceTenderId: 'tender-1', projectId: null, status: 'draft' });
  });

  it('defaults to operational, with no tender references — every existing caller unchanged', () => {
    expect(makePurchaseRequest({ tenantId: T, title: 'Buy' })).toMatchObject({ purpose: 'operational', sourceTenderId: null, sourceBasisRevisionId: null });
  });

  it('refuses a pricing requisition without its tender or basis', () => {
    expect(() => makePurchaseRequest({ ...pricing, sourceTenderId: null })).toThrow(/must name its tender and the BOQ basis/);
    expect(() => makePurchaseRequest({ ...pricing, sourceBasisRevisionId: null })).toThrow(/must name its tender and the BOQ basis/);
  });

  it('refuses a pricing requisition a project — it buys nothing', () => {
    expect(() => makePurchaseRequest({ ...pricing, projectId: 'proj-1' })).toThrow(/must not carry a project/);
  });

  it('refuses a pricing requisition born into an approval state', () => {
    expect(() => makePurchaseRequest({ ...pricing, status: 'approved' })).toThrow(/can only be a draft/);
  });

  it('refuses an operational requisition carrying tender references', () => {
    expect(() => makePurchaseRequest({ tenantId: T, title: 'x', sourceTenderId: 'tender-1' })).toThrow(/must not carry tender-pricing references/);
  });
});

describe('every door asks the one rule', () => {
  let requests: InMemoryPurchaseRequestStore;
  let requestLines: InMemoryPurchaseRequestLineStore;
  let rfqs: InMemoryRfqStore;
  let quotationLines: InMemoryQuotationLineStore;
  let boundary: TenderPricingBoundary;
  let ids: {
    pricingPr: string; operationalPr: string; pricingLine: string; operationalLine: string;
    pricingRfq: string; operationalRfq: string; pricingQuoteLine: string; operationalQuoteLine: string;
  };

  beforeEach(async () => {
    requests = new InMemoryPurchaseRequestStore();
    requestLines = new InMemoryPurchaseRequestLineStore();
    rfqs = new InMemoryRfqStore();
    quotationLines = new InMemoryQuotationLineStore();
    boundary = new TenderPricingBoundary(requests, requestLines, rfqs, quotationLines);

    const pricingPr = makePurchaseRequest({
      tenantId: T, title: 'Pricing', reference: 'PR-TP-1', purpose: 'tender_pricing', sourceTenderId: 'tender-1', sourceBasisRevisionId: 'rev-1',
    });
    const operationalPr = makePurchaseRequest({ tenantId: T, title: 'Buy', reference: 'PR-OP-1' });
    await requests.create(pricingPr);
    await requests.create(operationalPr);

    const line = (prId: string, boq?: string) => makePurchaseRequestLine({
      tenantId: T, prId, lineNo: 1, materialId: newId(), quantity: 10,
      snapshot: { materialCode: 'CAM-4MP', materialName: 'IP camera 4MP', uom: 'no', specification: null, manufacturer: null, model: null },
      sourceBoqItemId: boq ?? null,
    });
    const pricingLine = line(pricingPr.id, 'boq-item-1');
    const operationalLine = line(operationalPr.id);
    await requestLines.save(pricingLine);
    await requestLines.save(operationalLine);

    const pricingRfq = makeRfq({ tenantId: T, title: 'Pricing RFQ', prId: pricingPr.id });
    const operationalRfq = makeRfq({ tenantId: T, title: 'Buy RFQ', prId: operationalPr.id });
    await rfqs.create(pricingRfq);
    await rfqs.create(operationalRfq);

    const quote = (prLineId: string) => makeQuotationLine({ tenantId: T, revisionId: newId(), prLineId, quantity: 10, unitPrice: 400 });
    const pricingQuoteLine = quote(pricingLine.id);
    const operationalQuoteLine = quote(operationalLine.id);
    await quotationLines.create(pricingQuoteLine);
    await quotationLines.create(operationalQuoteLine);

    ids = {
      pricingPr: pricingPr.id, operationalPr: operationalPr.id,
      pricingLine: pricingLine.id, operationalLine: operationalLine.id,
      pricingRfq: pricingRfq.id, operationalRfq: operationalRfq.id,
      pricingQuoteLine: pricingQuoteLine.id, operationalQuoteLine: operationalQuoteLine.id,
    };
  });

  it('APPROVAL door — a pricing requisition is refused submission and approval, by reference', async () => {
    await expect(boundary.assertMayEnterApproval(ids.pricingPr))
      .rejects.toThrow(/submitting or approving is not allowed for tender-pricing requisition PR-TP-1/);
    await expect(boundary.assertMayEnterApproval(ids.operationalPr)).resolves.toBeUndefined();
  });

  it('HEADER door — an order naming the pricing requisition, or only its RFQ, is refused', async () => {
    await expect(boundary.assertMayRaiseOrder({ prId: ids.pricingPr }, T)).rejects.toThrow(/raising a purchase order is not allowed/);
    await expect(boundary.assertMayRaiseOrder({ rfqId: ids.pricingRfq }, T)).rejects.toThrow(/raising a purchase order is not allowed/);
    await expect(boundary.assertMayRaiseOrder({ prId: ids.operationalPr, rfqId: ids.operationalRfq }, T)).resolves.toBeUndefined();
    await expect(boundary.assertMayRaiseOrder({}, T), 'an order naming nothing is an ordinary direct order').resolves.toBeUndefined();
  });

  it('LINE door — a line naming a pricing requisition line is refused', async () => {
    await expect(boundary.assertMayOrderLine({ sourcePrLineId: ids.pricingLine }, T))
      .rejects.toThrow(/raising a purchase order line is not allowed for tender-pricing requisition PR-TP-1/);
  });

  it('LINE door — a pricing QUOTATION line is refused even beside an operational requisition line', async () => {
    // The combination only the quote-line branch can catch.
    await expect(boundary.assertMayOrderLine({ sourcePrLineId: ids.operationalLine, sourceQuoteLineId: ids.pricingQuoteLine }, T))
      .rejects.toThrow(/that supplier quotation was asked for to price a bid/);
    await expect(boundary.assertMayOrderLine({ sourcePrLineId: ids.operationalLine, sourceQuoteLineId: ids.operationalQuoteLine }, T))
      .resolves.toBeUndefined();
  });

  it('RECOMMENDATION door — refused on a pricing RFQ, open on an operational one', async () => {
    await expect(boundary.assertMayRecommend(ids.pricingRfq, T)).rejects.toThrow(/recommending an award is not allowed/);
    await expect(boundary.assertMayRecommend(ids.operationalRfq, T)).resolves.toBeUndefined();
  });

  it('does not reach across tenants — another tenant’s RFQ id answers nothing', async () => {
    await expect(boundary.assertMayRecommend(ids.pricingRfq, 'another-tenant')).resolves.toBeUndefined();
  });
});
